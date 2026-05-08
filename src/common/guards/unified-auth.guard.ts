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
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { User } from '@modules/users/entities/user.entity';
import { UserStatus } from '@common/enums';

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

interface LocalJwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

@Injectable()
export class UnifiedAuthGuard implements CanActivate {
  private readonly logger = new Logger(UnifiedAuthGuard.name);
  private jwksGetter: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
    private jwtService: JwtService,
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

    // Try OIDC first, then fallback to local JWT
    let user: User | null = null;

    try {
      user = await this.tryOidcAuth(token);
    } catch (oidcError) {
      this.logger.debug(`OIDC auth failed, trying local JWT: ${oidcError.message}`);
      try {
        user = await this.tryLocalJwt(token);
      } catch (jwtError) {
        this.logger.debug(`Local JWT auth failed: ${jwtError.message}`);
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    request.user = user;
    return true;
  }

  private async tryOidcAuth(token: string): Promise<User | null> {
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

    const oidcPayload = payload as OidcTokenPayload;
    const oidcSub = oidcPayload.sub;

    let user = await this.userRepository.findOne({
      where: { oidcSub },
      relations: ['investorProfile', 'entrepreneurProfile', 'assessorProfile'],
    });

    if (user) {
      user.lastLoginAt = new Date();
      if (oidcPayload.email && user.email !== oidcPayload.email) {
        user.email = oidcPayload.email;
      }
      if (oidcPayload.given_name && user.firstName !== oidcPayload.given_name) {
        user.firstName = oidcPayload.given_name;
      }
      if (oidcPayload.family_name && user.lastName !== oidcPayload.family_name) {
        user.lastName = oidcPayload.family_name;
      }
      if (oidcPayload.picture && user.avatar !== oidcPayload.picture) {
        user.avatar = oidcPayload.picture;
      }
      await this.userRepository.save(user);
      return user;
    }

    // Auto-provision new user from OIDC claims
    return this.autoProvisionOidcUser(oidcPayload);
  }

  private async autoProvisionOidcUser(payload: OidcTokenPayload): Promise<User> {
    const { UserRole, UserStatus, KycStatus } = await import('@common/enums');
    const oidcSub = payload.sub;
    const email = payload.email || `${oidcSub}@oidc.local`;
    const firstName = payload.given_name || payload.name?.split(' ')[0] || 'User';
    const lastName = payload.family_name || payload.name?.split(' ').slice(1).join(' ') || 'Unknown';
    const avatar = payload.picture || null;

    const roleMap: Record<string, any> = {
      investor: UserRole.INVESTOR,
      entrepreneur: UserRole.ENTREPRENEUR,
      provider: UserRole.ASSESSOR,
      assessor: UserRole.ASSESSOR,
      admin: UserRole.ADMIN,
      super_admin: UserRole.ADMIN,
    };
    const role = roleMap[(payload.app_role || payload.global_role || '').toLowerCase()] || UserRole.INVESTOR;

    const newUser = this.userRepository.create({
      oidcSub,
      oidcIssuer: this.configService.get<string>('oidc.issuer'),
      email,
      firstName,
      lastName,
      avatar,
      role,
      status: UserStatus.ACTIVE,
      kycStatus: payload.email_verified ? KycStatus.VERIFIED : KycStatus.NOT_STARTED,
      password: '',
      lastLoginAt: new Date(),
    } as any);

    const savedUser = await this.userRepository.save(newUser) as unknown as User;

    // Create role-specific profile
    await this.createRoleProfile(savedUser.id, role);

    this.logger.log(`Auto-provisioned OIDC user: ${email} (${role})`);

    return this.userRepository.findOneOrFail({
      where: { id: savedUser.id },
      relations: ['investorProfile', 'entrepreneurProfile', 'assessorProfile'],
    });
  }

  private async createRoleProfile(userId: string, role: any): Promise<void> {
    const { InvestorProfile } = await import('@modules/users/entities/investor-profile.entity');
    const { EntrepreneurProfile } = await import('@modules/users/entities/entrepreneur-profile.entity');
    const { AssessorProfile } = await import('@modules/users/entities/assessor-profile.entity');
    const { UserRole } = await import('@common/enums');

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

  private async tryLocalJwt(token: string): Promise<User | null> {
    const secret = this.configService.get<string>('jwt.accessSecret');
    const issuer = this.configService.get<string>('jwt.issuer');
    const audience = this.configService.get<string>('jwt.audience');

    const payload = this.jwtService.verify<LocalJwtPayload>(token, {
      secret,
      issuer,
      audience,
    });

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['investorProfile', 'entrepreneurProfile', 'assessorProfile'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Your account has been blocked. Please contact support.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended. Please contact support.');
    }

    return user;
  }
}
