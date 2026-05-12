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
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString } from "class-validator";
import { EntrepreneurStage, InvestorType, KycStatus, MembershipStatus, PlatformRole, Prisma, RiskTolerance, UserStatus } from "@prisma/client";
import { randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import {
  AuthenticatedUser,
  CurrentUser,
  getLimit,
  getPage,
  PaginatedResponse,
  PaginationDto,
  Roles,
  toPaginationMeta,
} from "@evzone/common";
import { OwnerOrAdminGuard } from "@evzone/auth";
import { PrismaService } from "@evzone/database";
import { PermissionsService } from "@evzone/permissions";
import { AuditService } from "@evzone/audit";
import { OutboxService } from "@evzone/events";

interface UserResponse {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  avatar: string | null;
  role: PlatformRole;
  status: UserStatus;
  kycStatus: KycStatus;
  countryCode: string | null;
  country: string | null;
  city: string | null;
  bio: string | null;
  riskLevel: string | null;
  preferences: Prisma.JsonValue | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  investorProfile?: unknown;
  entrepreneurProfile?: unknown;
  assessorProfile?: unknown;
}

class UserFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(PlatformRole)
  role?: PlatformRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(KycStatus)
  kycStatus?: KycStatus;

  @IsOptional()
  @IsString()
  country?: string;
}

class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(PlatformRole)
  role?: PlatformRole;
}

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  preferences?: Prisma.InputJsonValue;
}

class KycSubmitDto {
  @IsOptional()
  documents?: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  notes?: string;
}

class VerifyKycDto {
  @IsEnum(KycStatus)
  status!: KycStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateEntrepreneurProfileDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  companyRegistration?: string;

  @IsOptional()
  @IsString()
  companyWebsite?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsInt()
  foundedYear?: number;

  @IsOptional()
  @IsInt()
  teamSize?: number;

  @IsOptional()
  @IsEnum(EntrepreneurStage)
  stage?: EntrepreneurStage;

  @IsOptional()
  @IsString()
  pitchDeck?: string;
}

class UpdateInvestorProfileDto {
  @IsOptional()
  @IsEnum(InvestorType)
  investorType?: InvestorType;

  @IsOptional()
  @IsEnum(RiskTolerance)
  riskTolerance?: RiskTolerance;

  @IsOptional()
  @IsNumber()
  annualIncome?: number;

  @IsOptional()
  @IsNumber()
  netWorth?: number;

  @IsOptional()
  @IsString()
  accreditationStatus?: string;

  @IsOptional()
  investmentGoals?: string[];

  @IsOptional()
  preferredSectors?: string[];
}

class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsEnum(PlatformRole)
  role!: PlatformRole;
}

interface UserStatsResponse {
  total: number;
  byRole: Record<string, number>;
  byStatus: Record<string, number>;
  byKycStatus: Record<string, number>;
}

@Injectable()
class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async findAll(
    filter: UserFilterDto,
    currentUser: AuthenticatedUser,
  ): Promise<PaginatedResponse<UserResponse>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where = this.buildUserWhere(filter, currentUser);
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          memberships: true,
          investorProfile: true,
          entrepreneurProfile: true,
          assessorProfile: true,
        },
        orderBy: this.userOrderBy(filter.sortBy, filter.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: data.map((user) => this.toResponse(user)),
      meta: toPaginationMeta(page, limit, total),
    };
  }

  async getStats(currentUser: AuthenticatedUser): Promise<UserStatsResponse> {
    const tenantFilter = this.permissions.isPlatformAdmin(currentUser)
      ? {}
      : { memberships: { some: { tenantId: currentUser.tenantId } } };
    const [total, byRoleRows, byStatusRows, byKycRows] = await Promise.all([
      this.prisma.user.count({ where: tenantFilter }),
      this.prisma.userTenantMembership.groupBy({
        by: ["role"],
        where: this.permissions.isPlatformAdmin(currentUser)
          ? undefined
          : { tenantId: currentUser.tenantId },
        _count: { role: true },
      }),
      this.prisma.user.groupBy({
        by: ["status"],
        where: tenantFilter,
        _count: { status: true },
      }),
      this.prisma.user.groupBy({
        by: ["kycStatus"],
        where: tenantFilter,
        _count: { kycStatus: true },
      }),
    ]);

    return {
      total,
      byRole: Object.fromEntries(
        byRoleRows.map((row) => [row.role, row._count.role]),
      ),
      byStatus: Object.fromEntries(
        byStatusRows.map((row) => [row.status, row._count.status]),
      ),
      byKycStatus: Object.fromEntries(
        byKycRows.map((row) => [row.kycStatus, row._count.kycStatus]),
      ),
    };
  }

  async findById(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException("User not found");
    const userTenantId = user.memberships[0]?.tenantId;
    if (user.id !== currentUser.id && userTenantId) {
      this.permissions.assertTenantAccess(currentUser, userTenantId);
    }
    return this.toResponse(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    await this.findById(id, currentUser);
    if (dto.role && !this.permissions.isPlatformAdmin(currentUser)) {
      throw new BadRequestException("Only admins can change roles");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          email: dto.email?.toLowerCase(),
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          status: dto.status,
        },
        include: {
          memberships: true,
          investorProfile: true,
          entrepreneurProfile: true,
          assessorProfile: true,
        },
      });
      if (dto.role) {
        const membership = user.memberships[0];
        if (membership) {
          await tx.userTenantMembership.update({
            where: { id: membership.id },
            data: { role: dto.role },
          });
        }
      }
      return tx.user.findUniqueOrThrow({
        where: { id },
        include: {
          memberships: true,
          investorProfile: true,
          entrepreneurProfile: true,
          assessorProfile: true,
        },
      });
    });
    return this.toResponse(updated);
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
    currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    await this.findById(id, currentUser);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        avatar: dto.avatar,
        bio: dto.bio,
        countryCode: dto.countryCode,
        city: dto.city,
        preferences: dto.preferences,
      },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    return this.toResponse(updated);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: UserStatus.BLOCKED },
    });
    await this.audit.record({
      tenantId: undefined,
      userId: id,
      action: "user.soft_deleted",
      entityType: "user",
      entityId: id,
    });
  }

  async submitKyc(
    id: string,
    dto: KycSubmitDto,
    currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    const user = await this.findById(id, currentUser);
    if (user.kycStatus === KycStatus.VERIFIED)
      throw new BadRequestException("KYC is already verified");
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        kycStatus: KycStatus.PENDING,
        preferences: {
          kycDocuments: dto.documents ?? null,
          kycNotes: dto.notes ?? null,
        },
      },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    await this.audit.record({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      action: "kyc.submitted",
      entityType: "user",
      entityId: id,
    });
    await this.outbox.create(this.prisma, {
      tenantId: currentUser.tenantId,
      topic: "kyc.submitted",
      eventType: "kyc.submitted",
      aggregateType: "user",
      aggregateId: id,
      payload: { userId: id, kycStatus: KycStatus.PENDING },
    });
    return this.toResponse(updated);
  }

  async verifyKyc(id: string, dto: VerifyKycDto): Promise<UserResponse> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { kycStatus: dto.status },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    await this.audit.record({
      tenantId: updated.memberships?.[0]?.tenantId,
      userId: id,
      action: "kyc.verified",
      entityType: "user",
      entityId: id,
      metadata: { status: dto.status, notes: dto.notes },
    });
    await this.outbox.create(this.prisma, {
      tenantId: updated.memberships?.[0]?.tenantId,
      topic: "kyc.verified",
      eventType: "kyc.verified",
      aggregateType: "user",
      aggregateId: id,
      payload: { userId: id, kycStatus: dto.status },
    });

    return this.toResponse(updated);
  }

  async suspend(id: string, currentUser: AuthenticatedUser): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException("User not found");
    const userTenantId = user.memberships[0]?.tenantId;
    if (userTenantId) {
      this.permissions.assertTenantAccess(currentUser, userTenantId);
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.SUSPENDED },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    await this.audit.record({
      tenantId: updated.memberships?.[0]?.tenantId,
      userId: id,
      action: "user.suspended",
      entityType: "user",
      entityId: id,
    });
    return this.toResponse(updated);
  }

  async unsuspend(id: string, currentUser: AuthenticatedUser): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException("User not found");
    const userTenantId = user.memberships[0]?.tenantId;
    if (userTenantId) {
      this.permissions.assertTenantAccess(currentUser, userTenantId);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: { status: UserStatus.ACTIVE },
        include: {
          memberships: true,
          investorProfile: true,
          entrepreneurProfile: true,
          assessorProfile: true,
        },
      });
      await this.audit.record({
        tenantId: result.memberships?.[0]?.tenantId,
        userId: id,
        action: "user.unsuspended",
        entityType: "user",
        entityId: id,
      });
      await this.outbox.create(tx, {
        tenantId: result.memberships?.[0]?.tenantId ?? "",
        topic: "user.unsuspended",
        eventType: "user.unsuspended",
        aggregateType: "user",
        aggregateId: id,
        payload: { userId: id, status: UserStatus.ACTIVE },
      });
      return result;
    });
    return this.toResponse(updated);
  }

  async updateEntrepreneurProfile(
    id: string,
    dto: UpdateEntrepreneurProfileDto,
    currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    await this.findById(id, currentUser);
    await this.prisma.entrepreneurProfile.upsert({
      where: { userId: id },
      create: {
        userId: id,
        companyName: dto.companyName ?? "",
        companyRegistration: dto.companyRegistration,
        companyWebsite: dto.companyWebsite,
        industry: dto.industry ?? "",
        foundedYear: dto.foundedYear,
        teamSize: dto.teamSize,
        stage: dto.stage,
        pitchDeck: dto.pitchDeck,
      },
      update: {
        companyName: dto.companyName,
        companyRegistration: dto.companyRegistration,
        companyWebsite: dto.companyWebsite,
        industry: dto.industry,
        foundedYear: dto.foundedYear,
        teamSize: dto.teamSize,
        stage: dto.stage,
        pitchDeck: dto.pitchDeck,
      },
    });
    const updated = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    return this.toResponse(updated!);
  }

  async updateInvestorProfile(
    id: string,
    dto: UpdateInvestorProfileDto,
    currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    await this.findById(id, currentUser);
    await this.prisma.investorProfile.upsert({
      where: { userId: id },
      create: {
        userId: id,
        investorType: dto.investorType ?? InvestorType.INDIVIDUAL,
        riskTolerance: dto.riskTolerance ?? RiskTolerance.MODERATE,
        annualIncome: dto.annualIncome,
        netWorth: dto.netWorth,
        accreditationStatus: dto.accreditationStatus === "true",
        investmentGoals: dto.investmentGoals,
        preferredSectors: dto.preferredSectors,
      },
      update: {
        investorType: dto.investorType,
        riskTolerance: dto.riskTolerance,
        annualIncome: dto.annualIncome,
        netWorth: dto.netWorth,
        accreditationStatus:
          dto.accreditationStatus === undefined
            ? undefined
            : dto.accreditationStatus === "true",
        investmentGoals: dto.investmentGoals,
        preferredSectors: dto.preferredSectors,
      },
    });
    const updated = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    return this.toResponse(updated!);
  }

  async inviteUser(
    dto: InviteUserDto,
    currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    if (!this.permissions.isPlatformAdmin(currentUser)) {
      throw new BadRequestException("Only platform admins can invite users");
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new BadRequestException("User with this email already exists");

    const tempPassword = randomBytes(16).toString("hex");
    const bcryptRounds = 12;
    const passwordHash = await bcrypt.hash(tempPassword, bcryptRounds);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        passwordHash,
        status: UserStatus.ACTIVE,
        kycStatus: KycStatus.VERIFIED,
        memberships: {
          create: {
            tenantId: currentUser.tenantId,
            role: dto.role,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });

    await this.audit.record({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      action: "user.invited",
      entityType: "user",
      entityId: created.id,
      newValues: { email: dto.email, role: dto.role },
    });

    return this.toResponse(created);
  }

  private buildUserWhere(
    filter: UserFilterDto,
    currentUser: AuthenticatedUser,
  ): Prisma.UserWhereInput {
    const and: Prisma.UserWhereInput[] = [{ deletedAt: null }];
    if (!this.permissions.isPlatformAdmin(currentUser)) {
      and.push({ memberships: { some: { tenantId: currentUser.tenantId } } });
    }
    if (filter.role) and.push({ memberships: { some: { role: filter.role } } });
    if (filter.status) and.push({ status: filter.status });
    if (filter.kycStatus) and.push({ kycStatus: filter.kycStatus });
    if (filter.country)
      and.push({
        countryCode: { equals: filter.country, mode: "insensitive" },
      });
    if (filter.search) {
      and.push({
        OR: [
          { email: { contains: filter.search, mode: "insensitive" } },
          { firstName: { contains: filter.search, mode: "insensitive" } },
          { lastName: { contains: filter.search, mode: "insensitive" } },
        ],
      });
    }
    return { AND: and };
  }

  private userOrderBy(
    sortBy: string | undefined,
    sortOrder: "asc" | "desc" = "desc",
  ): Prisma.UserOrderByWithRelationInput {
    if (sortBy === "email") return { email: sortOrder };
    if (sortBy === "firstName") return { firstName: sortOrder };
    if (sortBy === "lastLoginAt") return { lastLoginAt: sortOrder };
    if (sortBy === "updatedAt") return { updatedAt: sortOrder };
    return { createdAt: sortOrder };
  }

  private toResponse(
    user: Prisma.UserGetPayload<{
      include: {
        memberships: true;
        investorProfile: true;
        entrepreneurProfile: true;
        assessorProfile: true;
      };
    }>,
  ): UserResponse {
    const role = user.memberships[0]?.role ?? PlatformRole.INVESTOR;
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      role,
      status: user.status,
      kycStatus: user.kycStatus,
      countryCode: user.countryCode,
      country: user.countryCode,
      city: user.city,
      bio: user.bio,
      riskLevel: user.riskLevel,
      preferences: user.preferences,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      investorProfile: user.investorProfile,
      entrepreneurProfile: user.entrepreneurProfile,
      assessorProfile: user.assessorProfile,
    };
  }
}

@ApiTags("Users")
@ApiBearerAuth()
@Controller("users")
class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
    PlatformRole.COMPLIANCE_OFFICER,
    PlatformRole.SUPPORT_AGENT,
  )
  findAll(
    @Query() filter: UserFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<UserResponse>> {
    return this.usersService.findAll(filter, user);
  }

  @Get("stats/overview")
  @Roles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
    PlatformRole.COMPLIANCE_OFFICER,
  )
  getStats(@CurrentUser() user: AuthenticatedUser): Promise<UserStatsResponse> {
    return this.usersService.getStats(user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  findById(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.findById(id, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.update(id, dto, user);
  }

  @Delete(":id")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@Param("id") id: string): Promise<void> {
    return this.usersService.softDelete(id);
  }

  @Post(":id/verify")
  @Roles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
    PlatformRole.COMPLIANCE_OFFICER,
  )
  verifyKyc(
    @Param("id") id: string,
    @Body() dto: VerifyKycDto,
  ): Promise<UserResponse> {
    return this.usersService.verifyKyc(id, dto);
  }

  @Post(":id/suspend")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  suspend(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.usersService.suspend(id, user);
  }

  @Post(":id/unsuspend")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  unsuspend(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.usersService.unsuspend(id, user);
  }

  @Get(":id/profile")
  getProfile(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.findById(id, user);
  }

  @Patch(":id/profile")
  updateProfile(
    @Param("id") id: string,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.updateProfile(id, dto, user);
  }

  @Post(":id/kyc")
  submitKyc(
    @Param("id") id: string,
    @Body() dto: KycSubmitDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.submitKyc(id, dto, user);
  }

  @Get(":id/kyc")
  async getKycStatus(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ kycStatus: KycStatus; documents: Prisma.JsonValue | null }> {
    const found = await this.usersService.findById(id, user);
    const preferences = found.preferences;
    const documents =
      preferences &&
      typeof preferences === "object" &&
      !Array.isArray(preferences) &&
      "kycDocuments" in preferences
        ? (preferences.kycDocuments ?? null)
        : null;
    return { kycStatus: found.kycStatus, documents };
  }

  @Patch(":id/entrepreneur-profile")
  updateEntrepreneurProfile(
    @Param("id") id: string,
    @Body() dto: UpdateEntrepreneurProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.updateEntrepreneurProfile(id, dto, user);
  }

  @Patch(":id/investor-profile")
  updateInvestorProfile(
    @Param("id") id: string,
    @Body() dto: UpdateInvestorProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.updateInvestorProfile(id, dto, user);
  }

  @Get(":id/notification-preferences")
  async getNotificationPreferences(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    const found = await this.usersService.findById(id, user);
    const prefs =
      found.preferences &&
      typeof found.preferences === "object" &&
      !Array.isArray(found.preferences) &&
      "notifications" in found.preferences
        ? (found.preferences as Record<string, unknown>).notifications
        : {};
    return prefs;
  }

  @Patch(":id/notification-preferences")
  async updateNotificationPreferences(
    @Param("id") id: string,
    @Body() dto: { preferences: unknown },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    const found = await this.usersService.findById(id, user);
    const currentPrefs =
      found.preferences && typeof found.preferences === "object" && !Array.isArray(found.preferences)
        ? (found.preferences as Record<string, unknown>)
        : {};
    return this.usersService.updateProfile(id, {
      preferences: {
        ...currentPrefs,
        notifications: dto.preferences as Prisma.InputJsonValue,
      },
    }, user);
  }

  @Post("invite")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  inviteUser(
    @Body() dto: InviteUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.inviteUser(dto, user);
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService, OwnerOrAdminGuard],
  exports: [UsersService],
})
export class UsersModule {}
