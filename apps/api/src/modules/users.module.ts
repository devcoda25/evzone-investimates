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
import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";
import { KycStatus, PlatformRole, Prisma, UserStatus } from "@prisma/client";
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
    return this.toResponse(updated);
  }

  async suspend(id: string): Promise<UserResponse> {
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
    return this.toResponse(updated);
  }

  async unsuspend(id: string): Promise<UserResponse> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.ACTIVE },
      include: {
        memberships: true,
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
    });
    return this.toResponse(updated);
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
  suspend(@Param("id") id: string): Promise<UserResponse> {
    return this.usersService.suspend(id);
  }

  @Post(":id/unsuspend")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  unsuspend(@Param("id") id: string): Promise<UserResponse> {
    return this.usersService.unsuspend(id);
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
}

@Module({
  controllers: [UsersController],
  providers: [UsersService, OwnerOrAdminGuard],
  exports: [UsersService],
})
export class UsersModule {}
