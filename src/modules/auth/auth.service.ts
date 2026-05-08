import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from '@modules/users/entities/user.entity';
import { RefreshToken } from '@modules/auth/entities/refresh-token.entity';
import { MailService } from '@modules/mail/mail.service';
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // ───────────────────────────────────────────────
  // Registration
  // ───────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<TokenResponseDto> {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = this.userRepository.create({
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      country: dto.country,
      phone: dto.phone,
      status: UserStatus.PENDING_VERIFICATION,
      kycStatus: KycStatus.NOT_STARTED,
    });

    const savedUser = await this.userRepository.save(user);

    // Create role-specific profile
    await this.createRoleProfile(savedUser.id, savedUser.role);

    // Generate tokens
    const tokens = await this.generateTokens(savedUser);

    // Send welcome email
    try {
      await this.mailService.sendWelcome(savedUser.email, savedUser.firstName, savedUser.role);
    } catch (err) {
      this.logger.error(`Failed to send welcome email: ${err.message}`);
    }

    this.logger.log(`User registered: ${savedUser.email} (${savedUser.role})`);

    return this.buildTokenResponse(savedUser, tokens);
  }

  // ───────────────────────────────────────────────
  // Login
  // ───────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<TokenResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      relations: ['investorProfile', 'entrepreneurProfile', 'assessorProfile'],
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
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= 5) {
        const lockoutDuration = 15 * 60 * 1000; // 15 minutes
        user.lockoutUntil = new Date(Date.now() + lockoutDuration);
        this.logger.warn(`Account locked due to failed attempts: ${user.email}`);
      }
      await this.userRepository.save(user);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset login attempts on success
    if (user.loginAttempts > 0 || user.lockoutUntil) {
      user.loginAttempts = 0;
      user.lockoutUntil = null as any;
    }
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const tokens = await this.generateTokens(user, ipAddress, userAgent);

    this.logger.log(`User logged in: ${user.email}`);

    return this.buildTokenResponse(user, tokens);
  }

  // ───────────────────────────────────────────────
  // Token Refresh
  // ───────────────────────────────────────────────

  async refresh(userId: string, tokenId: string): Promise<TokenResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['investorProfile', 'entrepreneurProfile', 'assessorProfile'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === UserStatus.BLOCKED || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is not active');
    }

    // Revoke the old refresh token
    await this.refreshTokenRepository.update(tokenId, {
      revokedAt: new Date(),
    });

    // Generate new tokens
    const tokens = await this.generateTokens(user);

    this.logger.log(`Token refreshed for user: ${user.email}`);

    return this.buildTokenResponse(user, tokens);
  }

  // ───────────────────────────────────────────────
  // Logout
  // ───────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // Find and revoke the refresh token by matching its hash
      const tokens = await this.refreshTokenRepository.find({
        where: { userId, revokedAt: null as any },
      });
      for (const token of tokens) {
        const valid = await bcrypt.compare(refreshToken, token.token);
        if (valid) {
          await this.refreshTokenRepository.update(token.id, {
            revokedAt: new Date(),
          });
          break;
        }
      }
    }
    this.logger.log(`User logged out: ${userId}`);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: null as any },
      { revokedAt: new Date() },
    );
    this.logger.log(`User logged out from all devices: ${userId}`);
  }

  // ───────────────────────────────────────────────
  // Password Management
  // ───────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.password) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    user.password = hashedPassword;
    await this.userRepository.save(user);

    // Revoke all refresh tokens for security
    await this.logoutAll(userId);

    this.logger.log(`Password changed for user: ${user.email}`);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string; token?: string }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
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

    // Store in user preferences (in production, send via email)
    const preferences = user.preferences || {};
    preferences.passwordResetToken = await bcrypt.hash(resetToken, 10);
    preferences.passwordResetExpires = resetExpires.toISOString();
    user.preferences = preferences;
    await this.userRepository.save(user);

    this.logger.log(`Password reset requested for: ${user.email}`);

    // Send password reset email
    try {
      await this.mailService.sendPasswordReset(user.email, resetToken, user.firstName);
    } catch (err) {
      this.logger.error(`Failed to send password reset email: ${err.message}`);
    }

    return {
      message: 'If the email exists, a password reset link has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    // Find user with a valid reset token
    const users = await this.userRepository.find({
      where: {},
    });

    let matchedUser: User | null = null;
    for (const user of users) {
      const prefs = user.preferences || {};
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
    matchedUser.password = hashedPassword;

    // Clear reset token
    const preferences = matchedUser.preferences || {};
    delete preferences.passwordResetToken;
    delete preferences.passwordResetExpires;
    matchedUser.preferences = preferences;

    await this.userRepository.save(matchedUser);

    // Revoke all refresh tokens
    await this.logoutAll(matchedUser.id);

    this.logger.log(`Password reset completed for: ${matchedUser.email}`);
  }

  // ───────────────────────────────────────────────
  // Get Current User (OIDC)
  // ───────────────────────────────────────────────

  async getMe(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['investorProfile', 'entrepreneurProfile', 'assessorProfile'],
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'avatar',
        'phone',
        'role',
        'status',
        'kycStatus',
        'country',
        'city',
        'bio',
        'preferences',
        'lastLoginAt',
        'createdAt',
        'updatedAt',
        'oidcSub',
        'oidcIssuer',
      ],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // ───────────────────────────────────────────────
  // Token Generation Helpers
  // ───────────────────────────────────────────────

  private async generateTokens(
    user: User,
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

    await this.refreshTokenRepository.save({
      id: tokenId,
      userId: user.id,
      token: refreshTokenHash,
      expiresAt: new Date(Date.now() + refreshExpiry),
      ipAddress,
      userAgent,
    });

    const expiresInSeconds = Math.floor(this.parseDuration(accessExpiration) / 1000);

    return { accessToken, refreshToken, expiresIn: expiresInSeconds, tokenId };
  }

  private buildTokenResponse(
    user: User,
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
        fullName: user.fullName,
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
