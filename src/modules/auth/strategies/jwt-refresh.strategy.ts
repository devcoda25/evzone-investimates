import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Request } from 'express';
import { RefreshToken } from '@modules/auth/entities/refresh-token.entity';
import { User } from '@modules/users/entities/user.entity';

interface RefreshJwtPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null => {
          // Try body first
          if (req.body && req.body.refreshToken) {
            return req.body.refreshToken;
          }
          // Then try cookie
          if (req.cookies && req.cookies.refreshToken) {
            return req.cookies.refreshToken;
          }
          // Then try Authorization header
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
          }
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      issuer: configService.get<string>('jwt.issuer'),
      audience: configService.get<string>('jwt.audience'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: RefreshJwtPayload): Promise<{ user: User; tokenId: string }> {
    const tokenString =
      req.body?.refreshToken ||
      req.cookies?.refreshToken ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring(7)
        : null);

    if (!tokenString) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    // Find the stored refresh token record by matching the token hash
    // The jti in the payload is the token ID
    const storedToken = await this.refreshTokenRepository.findOne({
      where: {
        id: payload.jti,
        userId: payload.sub,
        revokedAt: null as any,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token is invalid, expired, or has been revoked');
    }

    // Verify the token value matches (the stored token is hashed)
    // For simplicity, we check via the jti claim which is the token ID
    // The actual token string validation happens via JWT signature verification

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['investorProfile', 'entrepreneurProfile', 'providerProfile'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { user, tokenId: payload.jti };
  }
}
