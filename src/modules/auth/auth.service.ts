import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '@database/prisma.service';
import { MailService } from '@modules/mail/mail.service';
import { createRoleProfile, userProfileInclude } from '@modules/users/user.prisma';
import {
  UserRole,
  UserStatus,
  KycStatus,
} from '@common/enums';
import {
  LoginDto,
  RegisterDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { TokenResponseDto } from './dto/token-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // ───────────────────────────────────────────────
  // Registration
  // ───────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<TokenResponseDto> {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role as UserRole,
        country: dto.country,
        phone: dto.phone,
        status: UserStatus.PENDING_VERIFICATION,
        kycStatus: KycStatus.NOT_STARTED,
      },
    });

    // Create role-specific profile
    await this.createRoleProfile(user.id, user.role as UserRole);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Send welcome email
    try {
      await this.mailService.sendWelcome(user.email, user.firstName, user.role);
    } catch (err) {
      this.logger.error(`Failed to send welcome email: ${(err as Error).message}`);
    }

    this.logger.log(`User registered: ${user.email} (${user.role})`);

    return this.buildTokenResponse(user, tokens);
  }

  // ───────────────────────────────────────────────
  // Login
  // ───────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<TokenResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
      include: userProfileInclude,
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check account lockout
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      throw new UnauthorizedException(
        `Account locked. Try again after ${user.lockoutUntil.toISOString()}`
      );
    }

    // Check blocked/suspended
    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Your account has been blocked. Please contact support.');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended. Please contact support.');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      // Increment login attempts
      const loginAttempts = (user.loginAttempts || 0) + 1;
      let lockoutUntil: Date | null = user.lockoutUntil;
      if (loginAttempts >= 5) {
        const lockoutDuration = 15 * 60 * 1000; // 15 minutes
        lockoutUntil = new Date(Date.now() + lockoutDuration);
        this.logger.warn(`Account locked due to failed attempts: ${user.email}`);
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts, lockoutUntil },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset login attempts on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockoutUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const tokens = await this.generateTokens(user, ipAddress, userAgent);

    this.logger.log(`User logged in: ${user.email}`);

    return this.buildTokenResponse(user, tokens);
  }

  // ───────────────────────────────────────────────
  // Token Refresh
  // ───────────────────────────────────────────────

  async refresh(userId: string, tokenId: string): Promise<TokenResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: userProfileInclude,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === UserStatus.BLOCKED || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is not active');
    }

    // Revoke the old refresh token
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(user);

    this.logger.log(`Token refreshed for user: ${user.email}`);

    return this.buildTokenResponse(user, tokens);
  }

  // ───────────────────────────────────────────────
  // Logout
  // ───────────────────────────────────────────────

  async logout(userId: string, refreshTokenOrId?: string): Promise<void> {
    if (refreshTokenOrId) {
      const revokedAt = new Date();

      if (refreshTokenOrId.includes('.')) {
        try {
          const payload = this.jwtService.verify<{ jti: string }>(refreshTokenOrId, {
            secret: this.configService.get<string>('jwt.refreshSecret'),
            issuer: this.configService.get<string>('jwt.issuer'),
            audience: this.configService.get<string>('jwt.audience'),
          });

          await this.prisma.refreshToken.updateMany({
            where: { id: payload.jti, userId, revokedAt: null },
            data: { revokedAt },
          });
        } catch {
          // Ignore invalid refresh token bodies during logout.
        }
      } else {
        await this.prisma.refreshToken.updateMany({
          where: { id: refreshTokenOrId, userId, revokedAt: null },
          data: { revokedAt },
        });
      }
    }

    this.logger.log(`User logged out: ${userId}`);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`User logged out from all devices: ${userId}`);
  }

  // ───────────────────────────────────────────────
  // Password Management
  // ───────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user || !user.password) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Revoke all refresh tokens for security
    await this.logoutAll(userId);

    this.logger.log(`Password changed for user: ${user.email}`);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });

    if (!user) {
      // Always return the same message to prevent email enumeration
      return {
        message: 'If the email exists, a password reset link has been sent',
      };
    }

    // Generate secure reset token
    const resetToken = randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store in user preferences
    const preferences = (user.preferences as Record<string, any>) || {};
    preferences.passwordResetToken = await bcrypt.hash(resetToken, 10);
    preferences.passwordResetExpires = resetExpires.toISOString();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { preferences },
    });

    this.logger.log(`Password reset requested for: ${user.email}`);

    // Send password reset email
    try {
      await this.mailService.sendPasswordReset(user.email, resetToken, user.firstName);
    } catch (err) {
      this.logger.error(`Failed to send password reset email: ${(err as Error).message}`);
    }

    return {
      message: 'If the email exists, a password reset link has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    // Find user with a valid reset token
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
    });

    let matchedUser: (typeof users)[0] | null = null;
    for (const user of users) {
      const prefs = (user.preferences as Record<string, any>) || {};
      if (
        prefs.passwordResetToken &&
        prefs.passwordResetExpires &&
        new Date(prefs.passwordResetExpires) > new Date()
      ) {
        const valid = await bcrypt.compare(dto.token, prefs.passwordResetToken);
        if (valid) {
          matchedUser = user;
          break;
        }
      }
    }

    if (!matchedUser) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    // Clear reset token
    const preferences = (matchedUser.preferences as Record<string, any>) || {};
    delete preferences.passwordResetToken;
    delete preferences.passwordResetExpires;

    await this.prisma.user.update({
      where: { id: matchedUser.id },
      data: { password: hashedPassword, preferences },
    });

    // Revoke all refresh tokens
    await this.logoutAll(matchedUser.id);

    this.logger.log(`Password reset completed for: ${matchedUser.email}`);
  }

  // ───────────────────────────────────────────────
  // Get Current User (OIDC)
  // ───────────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: userProfileInclude,
      omit: {
        password: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      fullName: `${user.firstName} ${user.lastName}`,
    };
  }

  // ───────────────────────────────────────────────
  // Token Generation Helpers
  // ───────────────────────────────────────────────

  private async generateTokens(
    user: { id: string; email: string; role: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; tokenId: string }> {
    const accessSecret = this.configService.get<string>('jwt.accessSecret');
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');
    const accessExpiration = this.configService.get<string>('jwt.accessExpiration') || '15m';
    const refreshExpiration = this.configService.get<string>('jwt.refreshExpiration') || '7d';
    const issuer = this.configService.get<string>('jwt.issuer') || 'evzone-api';
    const audience = this.configService.get<string>('jwt.audience') || 'evzone-apps';

    // Access token
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret: accessSecret,
        expiresIn: accessExpiration,
        issuer,
        audience,
      },
    );

    // Refresh token with jti
    const tokenId = randomBytes(16).toString('hex');
    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        jti: tokenId,
      },
      {
        secret: refreshSecret,
        expiresIn: refreshExpiration,
        issuer,
        audience,
      },
    );

    // Store refresh token hash in DB
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const refreshExpiry = this.parseDuration(refreshExpiration);

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId: user.id,
        token: refreshTokenHash,
        expiresAt: new Date(Date.now() + refreshExpiry),
        ipAddress,
        userAgent,
      },
    });

    const expiresInSeconds = Math.floor(this.parseDuration(accessExpiration) / 1000);

    return { accessToken, refreshToken, expiresIn: expiresInSeconds, tokenId };
  }

  private buildTokenResponse(
    user: any,
    tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  ): TokenResponseDto {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        role: user.role,
        status: user.status,
        kycStatus: user.kycStatus,
        avatar: user.avatar,
        country: user.country,
        phone: user.phone,
        createdAt: user.createdAt,
      },
    };
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 15 * 60 * 1000; // default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * (multipliers[unit] || 60000);
  }
}
