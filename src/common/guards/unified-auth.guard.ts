import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@database/prisma.service';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { UserRole, UserStatus, KycStatus } from '@common/enums';
import { normalizeUser, userProfileInclude, createRoleProfile, mapUserRole } from '@modules/users/user.prisma';

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
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header missing or invalid');
    }

    const token = authHeader.substring(7);

    try {
      request.user = await this.tryOidcAuth(token);
      return true;
    } catch (oidcError) {
      this.logger.debug(`OIDC auth failed, trying local JWT: ${(oidcError as Error).message}`);
    }

    try {
      request.user = await this.tryLocalJwt(token);
      return true;
    } catch (jwtError) {
      this.logger.debug(`Local JWT auth failed: ${(jwtError as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async tryOidcAuth(token: string) {
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

    return this.resolveOidcUser(payload as OidcTokenPayload);
  }

  private async resolveOidcUser(payload: OidcTokenPayload) {
    const existingUser = await this.prisma.user.findFirst({
      where: { oidcSub: payload.sub, deletedAt: null },
      include: userProfileInclude,
    });

    if (existingUser) {
      const updatedUser = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          lastLoginAt: new Date(),
          email: payload.email || existingUser.email,
          firstName: payload.given_name || existingUser.firstName,
          lastName: payload.family_name || existingUser.lastName,
          avatar: payload.picture || existingUser.avatar,
        },
        include: userProfileInclude,
      });

      return normalizeUser(updatedUser);
    }

    const role = mapUserRole(payload.app_role || payload.global_role);
    const createdUser = await this.prisma.user.create({
      data: {
        oidcSub: payload.sub,
        oidcIssuer: this.configService.get<string>('oidc.issuer'),
        email: payload.email || `${payload.sub}@oidc.local`,
        firstName: payload.given_name || payload.name?.split(' ')[0] || 'User',
        lastName: payload.family_name || payload.name?.split(' ').slice(1).join(' ') || 'Unknown',
        avatar: payload.picture || null,
        role,
        status: UserStatus.ACTIVE,
        kycStatus: payload.email_verified ? KycStatus.VERIFIED : KycStatus.NOT_STARTED,
        password: '',
        lastLoginAt: new Date(),
      },
    });

    await createRoleProfile(this.prisma, createdUser.id, createdUser.role);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: createdUser.id },
      include: userProfileInclude,
    });

    this.logger.log(`Auto-provisioned OIDC user: ${user.email} (${user.role})`);

    return normalizeUser(user);
  }

  private async tryLocalJwt(token: string) {
    const payload = this.jwtService.verify<LocalJwtPayload>(token, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      issuer: this.configService.get<string>('jwt.issuer'),
      audience: this.configService.get<string>('jwt.audience'),
    });

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: userProfileInclude,
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

    return normalizeUser(user);
  }
}
