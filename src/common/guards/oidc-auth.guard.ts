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
import { PrismaService } from '@database/prisma.service';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { KycStatus, UserStatus } from '@common/enums';
import { createRoleProfile, mapUserRole, normalizeUser, userProfileInclude } from '@modules/users/user.prisma';

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
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
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
      const payload = await this.verifyToken(token);
      request.user = await this.resolveUser(payload);
      return true;
    } catch (error) {
      this.logger.warn(`Token verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException((error as Error).message || 'Invalid or expired token');
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

  private async resolveUser(payload: OidcTokenPayload) {
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

    const createdUser = await this.prisma.user.create({
      data: {
        oidcSub: payload.sub,
        oidcIssuer: this.configService.get<string>('oidc.issuer'),
        email: payload.email || `${payload.sub}@oidc.local`,
        firstName: payload.given_name || payload.name?.split(' ')[0] || 'User',
        lastName: payload.family_name || payload.name?.split(' ').slice(1).join(' ') || 'Unknown',
        avatar: payload.picture || null,
        role: mapUserRole(payload.app_role || payload.global_role),
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
}
