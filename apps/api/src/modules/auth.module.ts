import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { createHash, randomBytes, randomUUID } from "crypto";
import * as bcrypt from "bcrypt";
import {
  KycStatus,
  PlatformRole,
  Prisma,
  TenantType,
  UserStatus,
} from "@prisma/client";
import { AuditService } from "@evzone/audit";
import { CurrentUser, Public } from "@evzone/common";
import { JwtAccessPayload, JwtRefreshPayload } from "@evzone/auth";
import { PrismaService, TransactionService } from "@evzone/database";
import { OutboxService } from "@evzone/events";
import { RedisService } from "@evzone/redis";

interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: PlatformRole;
  tenantId: string;
  status: UserStatus;
  kycStatus: KycStatus;
}

interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: UserSummary;
  mfaRequired?: boolean;
}

class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(PlatformRole)
  role?: PlatformRole;
}

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

class RefreshDto {
  @IsString()
  refreshToken!: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

class VerifyMfaDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string;
}

class CreateApiKeyDto {
  @IsString()
  name!: string;
}

class RevokeSessionDto {
  @IsString()
  sessionId!: string;
}

@Injectable()
class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokenResponse> {
    const role = dto.role ?? PlatformRole.INVESTOR;
    const privilegedRoles: PlatformRole[] = [
      PlatformRole.SUPER_ADMIN,
      PlatformRole.ADMIN,
      PlatformRole.COMPLIANCE_OFFICER,
      PlatformRole.SUPPORT_AGENT,
    ];
    if (privilegedRoles.includes(role)) {
      throw new BadRequestException(
        "Privileged roles must be created by an administrator",
      );
    }

    const bcryptRounds = this.config.get<number>("app.bcryptRounds") ?? 12;
    const passwordHash = await bcrypt.hash(dto.password, bcryptRounds);
    const tenantSlug = `${dto.email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 8)}`;

    const created = await this.transactions.run(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name:
            role === PlatformRole.ENTREPRENEUR
              ? `${dto.firstName} ${dto.lastName} Company`
              : `${dto.firstName} ${dto.lastName}`,
          slug: tenantSlug,
          type: this.tenantTypeForRole(role),
        },
      });
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: UserStatus.ACTIVE,
          memberships: {
            create: { tenantId: tenant.id, role },
          },
        },
        include: { memberships: true },
      });
      await this.createProfile(tx, user.id, role, dto);
      await this.outbox.create(tx, {
        tenantId: tenant.id,
        topic: "user.created",
        eventType: "user.created",
        aggregateType: "user",
        aggregateId: user.id,
        payload: { userId: user.id, email: user.email, role },
      });
      await this.audit.record(
        {
          tenantId: tenant.id,
          userId: user.id,
          action: "user.registered",
          entityType: "user",
          entityId: user.id,
          newValues: { email: user.email, role },
        },
        tx,
      );
      return { user, tenantId: tenant.id, role };
    });

    return this.issueTokens(created.user.id, created.tenantId, created.role);
  }

  async login(dto: LoginDto): Promise<AuthTokenResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { memberships: { where: { status: "ACTIVE" } } },
    });
    if (!user || !user.passwordHash)
      throw new UnauthorizedException("Invalid email or password");
    if (
      user.deletedAt ||
      user.status === UserStatus.BLOCKED ||
      user.status === UserStatus.SUSPENDED
    ) {
      throw new UnauthorizedException("Account is not active");
    }
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      throw new UnauthorizedException(
        `Account locked. Try again after ${user.lockoutUntil.toISOString()}`,
      );
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      const loginAttempts = user.loginAttempts + 1;
      const lockoutUntil =
        loginAttempts >= 5
          ? new Date(Date.now() + 15 * 60 * 1000)
          : user.lockoutUntil;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts, lockoutUntil },
      });
      await this.audit.record({
        tenantId: user.memberships?.[0]?.tenantId,
        userId: user.id,
        action: "login.failed",
        entityType: "auth",
        entityId: user.id,
        metadata: { reason: "Invalid password" },
        ipAddress: "",
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    // MFA verification check
    if (user.mfaEnabled) {
      const mfaKey = `mfa:pending:${user.id}`;
      const pendingMfa = await this.redis.get(mfaKey);
      if (pendingMfa !== "verified") {
        // Generate and store OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await this.redis.setJson(`mfa:otp:${user.id}`, { otp, verified: false }, 300);
        await this.audit.record({
          tenantId: user.memberships?.[0]?.tenantId,
          userId: user.id,
          action: "mfa.challenge",
          entityType: "auth",
          entityId: user.id,
          metadata: { method: "totp" },
        });
        return { mfaRequired: true } as any;
      }
    }

    const membership = user.memberships[0];
    if (!membership)
      throw new UnauthorizedException("User has no active tenant membership");

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        loginAttempts: 0,
        lockoutUntil: null,
      },
    });
    await this.audit.record({
      tenantId: membership.tenantId,
      userId: user.id,
      action: "login.success",
      entityType: "auth",
      entityId: user.id,
      metadata: { role: membership.role },
    });
    return this.issueTokens(user.id, membership.tenantId, membership.role);
  }

  async refresh(dto: RefreshDto): Promise<AuthTokenResponse> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(
        dto.refreshToken,
        {
          secret: this.config.get<string>("jwt.refreshSecret"),
        },
      );
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    const tokenHash = this.hashToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        id: payload.jti,
        userId: payload.sub,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!stored)
      throw new UnauthorizedException("Refresh token is invalid or expired");

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: {
          where: { tenantId: payload.tenantId, status: "ACTIVE" },
        },
      },
    });
    const membership = user?.memberships[0];
    if (!user || !membership)
      throw new UnauthorizedException("User or tenant membership not found");

    const response = await this.issueTokens(
      user.id,
      membership.tenantId,
      membership.role,
    );
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return response;
  }

  async getMe(userId: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { where: { status: "ACTIVE" } } },
    });
    if (!user || user.memberships.length === 0)
      throw new UnauthorizedException("User not found");
    const membership = user.memberships[0];
    return this.toUserSummary(user, membership.tenantId, membership.role);
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: "Logged out successfully" };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: "Logged out from all devices successfully" };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { where: { status: "ACTIVE" } } },
    });
    if (!user?.passwordHash)
      throw new BadRequestException(
        "Password login is not enabled for this account",
      );
    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!matches)
      throw new UnauthorizedException("Current password is invalid");
    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      this.config.get<number>("app.bcryptRounds") ?? 12,
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.audit.record({
      tenantId: user.memberships?.[0]?.tenantId,
      userId,
      action: "password.changed",
      entityType: "auth",
      entityId: userId,
    });
    await this.logout(userId);
    return { message: "Password changed successfully" };
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; resetToken?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user)
      return {
        message: "If the account exists, a reset link has been generated",
      };
    const resetToken = randomBytes(32).toString("hex");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(resetToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const nodeEnv = this.config.get<string>("app.nodeEnv") ?? "development";
    return nodeEnv === "production"
      ? { message: "If the account exists, a reset link has been generated" }
      : { message: "Reset token generated", resetToken };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.hashToken(dto.token);
    const reset = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!reset)
      throw new BadRequestException("Reset token is invalid or expired");
    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      this.config.get<number>("app.bcryptRounds") ?? 12,
    );
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: "Password reset successfully" };
  }

  private async issueTokens(
    userId: string,
    tenantId: string,
    role: PlatformRole,
  ): Promise<AuthTokenResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      role,
      tenantId,
    };
    const refreshId = randomUUID();
    const refreshPayload: JwtRefreshPayload = {
      sub: user.id,
      jti: refreshId,
      tenantId,
    };
    const accessExpiration =
      this.config.get<string>("jwt.accessExpiration") ?? "15m";
    const refreshExpiration =
      this.config.get<string>("jwt.refreshExpiration") ?? "7d";
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, { expiresIn: accessExpiration }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get<string>("jwt.refreshSecret"),
        expiresIn: refreshExpiration,
      }),
    ]);
    await this.prisma.refreshToken.create({
      data: {
        id: refreshId,
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.durationToMs(refreshExpiration)),
      },
    });
    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: Math.floor(this.durationToMs(accessExpiration) / 1000),
      user: this.toUserSummary(user, tenantId, role),
    };
  }

  private toUserSummary(
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      status: UserStatus;
      kycStatus: KycStatus;
    },
    tenantId: string,
    role: PlatformRole,
  ): UserSummary {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role,
      tenantId,
      status: user.status,
      kycStatus: user.kycStatus,
    };
  }

  private async createProfile(
    tx: Prisma.TransactionClient,
    userId: string,
    role: PlatformRole,
    dto: RegisterDto,
  ): Promise<void> {
    if (role === PlatformRole.INVESTOR) {
      await tx.investorProfile.create({ data: { userId } });
    }
    if (role === PlatformRole.ENTREPRENEUR) {
      await tx.entrepreneurProfile.create({
        data: {
          userId,
          companyName: `${dto.firstName} ${dto.lastName} Company`,
          industry: "Other",
        },
      });
    }
    if (role === PlatformRole.ASSESSOR) {
      await tx.assessorProfile.create({
        data: {
          userId,
          organizationName: `${dto.firstName} ${dto.lastName} Assessments`,
        },
      });
    }
  }

  private tenantTypeForRole(role: PlatformRole): TenantType {
    if (role === PlatformRole.ENTREPRENEUR)
      return TenantType.ENTREPRENEUR_COMPANY;
    if (role === PlatformRole.ASSESSOR) return TenantType.ASSESSOR_FIRM;
    if (role === PlatformRole.INVESTOR) return TenantType.INVESTOR_GROUP;
    return TenantType.ORGANIZATION;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private durationToMs(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 15 * 60 * 1000;
    const amount = Number(match[1]);
    const unit = match[2];
    if (unit === "s") return amount * 1000;
    if (unit === "m") return amount * 60 * 1000;
    if (unit === "h") return amount * 60 * 60 * 1000;
    return amount * 24 * 60 * 60 * 1000;
  }

  async enableMfa(userId: string): Promise<{ message: string; secret: string }> {
    const secret = randomBytes(20).toString("hex");
    await this.redis.setJson(`mfa:secret:${userId}`, { secret, enabled: false }, 600);
    await this.audit.record({
      tenantId: undefined,
      userId,
      action: "mfa.enable_initiated",
      entityType: "auth",
      entityId: userId,
      metadata: { method: "totp" },
    });
    return { message: "MFA setup initiated. Scan the QR code with your authenticator app.", secret };
  }

  async disableMfa(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { where: { status: "ACTIVE" } } },
    });
    if (!user?.mfaEnabled) throw new BadRequestException("MFA is not enabled");
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false } });
    await this.redis.del(`mfa:secret:${userId}`);
    await this.redis.del(`mfa:otp:${userId}`);
    await this.redis.del(`mfa:pending:${userId}`);
    await this.audit.record({
      tenantId: user.memberships?.[0]?.tenantId,
      userId,
      action: "mfa.disabled",
      entityType: "auth",
      entityId: userId,
    });
    return { message: "MFA disabled successfully" };
  }

  async verifyMfa(dto: VerifyMfaDto): Promise<AuthTokenResponse> {
    interface MfaOtp {
      otp: string;
      verified: boolean;
    }
    const stored = await this.redis.getJson<MfaOtp>(`mfa:otp:${dto.userId}`);
    if (!stored || stored.verified) throw new BadRequestException("Invalid or expired MFA code");

    if (stored.otp !== dto.code) {
      throw new BadRequestException("Invalid MFA code");
    }

    const secretData = await this.redis.getJson<{ secret: string }>(`mfa:secret:${dto.userId}`);
    if (!secretData) {
      // Verify against existing user MFA
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId, mfaEnabled: true },
      });
      if (!user) throw new BadRequestException("MFA not enabled for this account");
    }

    // Mark OTP as verified
    await this.redis.setJson(`mfa:otp:${dto.userId}`, { ...stored, verified: true }, 300);
    // Store verified state for login completion
    await this.redis.setJson(`mfa:pending:${dto.userId}`, { verified: true }, 300);

    await this.audit.record({
      tenantId: undefined,
      userId: dto.userId,
      action: "mfa.verified",
      entityType: "auth",
      entityId: dto.userId,
    });

    // Issue tokens after MFA verification
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: { memberships: { where: { status: "ACTIVE" } } },
    });
    if (!user) throw new BadRequestException("User not found");
    const membership = user.memberships?.[0];
    if (!membership) throw new UnauthorizedException("User has no active tenant membership");
    await this.audit.record({
      tenantId: membership.tenantId,
      userId: user.id,
      action: "mfa.verified",
      entityType: "auth",
      entityId: user.id,
    });
    return this.issueTokens(user.id, membership.tenantId, membership.role);
  }

  async getSessions(userId: string): Promise<unknown[]> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return tokens.map((t) => ({
      id: t.id,
      device: t.userAgent ?? "Unknown device",
      ip: t.ipAddress ?? "Unknown",
      lastActive: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ message: string }> {
    const token = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
    });
    if (!token) throw new BadRequestException("Session not found");
    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    return { message: "Session revoked successfully" };
  }

  async createApiKey(userId: string, name: string): Promise<{ id: string; name: string; key: string }> {
    const key = `evz_${randomBytes(32).toString("hex")}`;
    const keyHash = this.hashToken(key);
    const created = await this.prisma.apiKey.create({
      data: { userId, name, keyHash },
    });
    return { id: created.id, name: created.name, key };
  }

  async listApiKeys(userId: string): Promise<unknown[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    }));
  }

  async revokeApiKey(userId: string, keyId: string): Promise<{ message: string }> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });
    if (!key) throw new BadRequestException("API key not found");
    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
    return { message: "API key revoked successfully" };
  }
}

@ApiTags("Auth")
@Controller("auth")
class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("register")
  @ApiOperation({ summary: "Register a new account" })
  register(@Body() dto: RegisterDto): Promise<AuthTokenResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login with email and password" })
  login(@Body() dto: LoginDto): Promise<AuthTokenResponse> {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<AuthTokenResponse> {
    return this.authService.refresh(dto);
  }

  @ApiBearerAuth()
  @Get("me")
  getMe(@CurrentUser("id") userId: string): Promise<UserSummary> {
    return this.authService.getMe(userId);
  }

  @ApiBearerAuth()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser("id") userId: string): Promise<{ message: string }> {
    return this.authService.logout(userId);
  }

  @ApiBearerAuth()
  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Logout from all devices" })
  logoutAll(@CurrentUser("id") userId: string): Promise<{ message: string }> {
    return this.authService.logoutAll(userId);
  }

  @ApiBearerAuth()
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser("id") userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(userId, dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string; resetToken?: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @Post("mfa/enable")
  @HttpCode(HttpStatus.OK)
  enableMfa(@CurrentUser("id") userId: string): Promise<{ message: string; secret: string }> {
    return this.authService.enableMfa(userId);
  }

  @ApiBearerAuth()
  @Post("mfa/disable")
  @HttpCode(HttpStatus.OK)
  disableMfa(@CurrentUser("id") userId: string): Promise<{ message: string }> {
    return this.authService.disableMfa(userId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("mfa/verify")
  @HttpCode(HttpStatus.OK)
  verifyMfa(@Body() dto: VerifyMfaDto): Promise<AuthTokenResponse> {
    return this.authService.verifyMfa(dto);
  }

  @ApiBearerAuth()
  @Get("sessions")
  getSessions(@CurrentUser("id") userId: string): Promise<unknown[]> {
    return this.authService.getSessions(userId);
  }

  @ApiBearerAuth()
  @Post("sessions/:id/revoke")
  @HttpCode(HttpStatus.OK)
  revokeSession(
    @CurrentUser("id") userId: string,
    @Param("id") sessionId: string,
  ): Promise<{ message: string }> {
    return this.authService.revokeSession(userId, sessionId);
  }

  @ApiBearerAuth()
  @Post("api-keys")
  @HttpCode(HttpStatus.OK)
  createApiKey(
    @CurrentUser("id") userId: string,
    @Body() dto: CreateApiKeyDto,
  ): Promise<{ id: string; name: string; key: string }> {
    return this.authService.createApiKey(userId, dto.name);
  }

  @ApiBearerAuth()
  @Get("api-keys")
  listApiKeys(@CurrentUser("id") userId: string): Promise<unknown[]> {
    return this.authService.listApiKeys(userId);
  }

  @ApiBearerAuth()
  @Delete("api-keys/:id")
  @HttpCode(HttpStatus.OK)
  revokeApiKey(
    @CurrentUser("id") userId: string,
    @Param("id") keyId: string,
  ): Promise<{ message: string }> {
    return this.authService.revokeApiKey(userId, keyId);
  }
}

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class ApiAuthModule {}
