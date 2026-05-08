import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { User } from '@modules/users/entities/user.entity';
import { UserRole, UserStatus } from '@common/enums';

interface OidcTokenPayload extends JWTPayload {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  app_role?: string;
  global_role?: string;
  picture?: string;
  email_verified?: boolean;
}

@Injectable()
export class OidcAuthGuard implements CanActivate {
  private readonly logger = new Logger(OidcAuthGuard.name);
  private jwksGetter: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header missing or invalid');
    }

    const token = authHeader.substring(7);

    try {
      const payload = await this.verifyToken(token);
      const user = await this.resolveUser(payload);
      request.user = user;
      return true;
    } catch (error) {
      this.logger.warn(`Token verification failed: ${error.message}`);
      throw new UnauthorizedException(error.message || 'Invalid or expired token');
    }
  }

  private async verifyToken(token: string): Promise<OidcTokenPayload> {
    const issuer = this.configService.get<string>('oidc.issuer');
    const audience = this.configService.get<string>('oidc.audience');
    const jwksUri = this.configService.get<string>('oidc.jwksUri');

    if (!this.jwksGetter) {
      if (!jwksUri) {
        throw new UnauthorizedException('OIDC JWKS URI is not configured');
      }
      this.jwksGetter = createRemoteJWKSet(new URL(jwksUri));
    }

    const { payload } = await jwtVerify(token, this.jwksGetter, {
      issuer,
      audience,
      clockTolerance: 30,
    });

    return payload as OidcTokenPayload;
  }

  private async resolveUser(payload: OidcTokenPayload): Promise<User> {
    const oidcSub = payload.sub;

    // Try to find existing user by oidcSub
    let user = await this.userRepository.findOne({
      where: { oidcSub },
      relations: ['investorProfile', 'entrepreneurProfile', 'assessorProfile'],
    });

    if (user) {
      // Update last login and sync basic fields
      user.lastLoginAt = new Date();
      if (payload.email && user.email !== payload.email) {
        user.email = payload.email;
      }
      if (payload.given_name && user.firstName !== payload.given_name) {
        user.firstName = payload.given_name;
      }
      if (payload.family_name && user.lastName !== payload.family_name) {
        user.lastName = payload.family_name;
      }
      if (payload.picture && user.avatar !== payload.picture) {
        user.avatar = payload.picture;
      }
      await this.userRepository.save(user);
      return user;
    }

    // Auto-provision new user from OIDC claims
    const email = payload.email || `${oidcSub}@oidc.local`;
    const firstName = payload.given_name || payload.name?.split(' ')[0] || 'User';
    const lastName = payload.family_name || payload.name?.split(' ').slice(1).join(' ') || 'Unknown';
    const avatar = payload.picture || null;

    // Map OIDC role claim to our UserRole
    const role = this.mapOidcRole(payload.app_role || payload.global_role);

    const newUser = this.userRepository.create({
      oidcSub,
      oidcIssuer: this.configService.get<string>('oidc.issuer'),
      email,
      firstName,
      lastName,
      avatar,
      role,
      status: UserStatus.ACTIVE,
      kycStatus: payload.email_verified ? 'VERIFIED' : 'NOT_STARTED',
      password: '', // No local password for OIDC users
      lastLoginAt: new Date(),
    } as any);

    const savedUser = await this.userRepository.save(newUser) as unknown as User;

    // Create role-specific profile
    await this.createRoleProfile(savedUser.id, role);

    this.logger.log(`Auto-provisioned OIDC user: ${email} (${role})`);

    // Reload with profiles
    return this.userRepository.findOneOrFail({
      where: { id: savedUser.id },
      relations: ['investorProfile', 'entrepreneurProfile', 'assessorProfile'],
    });
  }

  private mapOidcRole(oidcRole?: string): UserRole {
    if (!oidcRole) return UserRole.INVESTOR;
    const roleMap: Record<string, UserRole> = {
      investor: UserRole.INVESTOR,
      entrepreneur: UserRole.ENTREPRENEUR,
      provider: UserRole.ASSESSOR,
      assessor: UserRole.ASSESSOR,
      admin: UserRole.ADMIN,
      super_admin: UserRole.ADMIN,
    };
    return roleMap[oidcRole.toLowerCase()] || UserRole.INVESTOR;
  }

  private async createRoleProfile(userId: string, role: UserRole): Promise<void> {
    const { InvestorProfile } = await import('@modules/users/entities/investor-profile.entity');
    const { EntrepreneurProfile } = await import('@modules/users/entities/entrepreneur-profile.entity');
    const { AssessorProfile } = await import('@modules/users/entities/assessor-profile.entity');

    switch (role) {
      case UserRole.INVESTOR: {
        const repo = this.userRepository.manager.getRepository(InvestorProfile);
        await repo.save(repo.create({ userId }));
        break;
      }
      case UserRole.ENTREPRENEUR: {
        const repo = this.userRepository.manager.getRepository(EntrepreneurProfile);
        await repo.save(repo.create({ userId, companyName: 'My Company', industry: 'Other' }));
        break;
      }
      case UserRole.ASSESSOR: {
        const repo = this.userRepository.manager.getRepository(AssessorProfile);
        await repo.save(repo.create({ userId, organizationName: 'My Organization', yearsOfExperience: 0 }));
        break;
      }
      default:
        break;
    }
  }
}
