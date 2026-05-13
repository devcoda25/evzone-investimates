import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import {
  MembershipStatus,
  PlatformRole,
  Prisma,
  TenantStatus,
  TenantType,
} from "@prisma/client";
import {
  AuthenticatedUser,
  CurrentUser,
  PaginatedResponse,
  PaginationDto,
  Roles,
  getLimit,
  getPage,
  toPaginationMeta,
} from "@evzone/common";
import { PrismaService } from "@evzone/database";
import { PermissionsService } from "@evzone/permissions";

class TenantFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(TenantType)
  type?: TenantType;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}

class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}

interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
  status: TenantStatus;
  countryCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  membershipRole?: PlatformRole;
  membershipStatus?: MembershipStatus;
}

@Injectable()
class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async findAccessibleTenants(
    user: AuthenticatedUser,
    filter: TenantFilterDto,
  ): Promise<PaginatedResponse<TenantResponse>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.TenantWhereInput = {
      type: filter.type,
      status: filter.status,
      ...(this.permissions.isPlatformAdmin(user)
        ? {}
        : { users: { some: { userId: user.id, status: MembershipStatus.ACTIVE } } }),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: "insensitive" } },
              { slug: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          users: {
            where: { userId: user.id },
            select: { role: true, status: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data: items.map((tenant) => this.toResponse(tenant)),
      meta: toPaginationMeta(page, limit, total),
    };
  }

  async findCurrentTenant(user: AuthenticatedUser): Promise<TenantResponse> {
    return this.findById(user.tenantId, user);
  }

  async findById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<TenantResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
          where: { userId: user.id },
          select: { role: true, status: true },
          take: 1,
        },
      },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");
    this.permissions.assertTenantAccess(user, id);
    return this.toResponse(tenant);
  }

  async update(
    id: string,
    dto: UpdateTenantDto,
    user: AuthenticatedUser,
  ): Promise<TenantResponse> {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Tenant not found");

    if (!this.permissions.isPlatformAdmin(user) && user.tenantId !== id) {
      throw new NotFoundException("Tenant not found");
    }

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        countryCode: dto.countryCode,
        status: dto.status,
      },
      include: {
        users: {
          where: { userId: user.id },
          select: { role: true, status: true },
          take: 1,
        },
      },
    });

    return this.toResponse(tenant);
  }

  async getSettings(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    if (!this.permissions.isPlatformAdmin(user) && user.tenantId !== id) {
      throw new NotFoundException("Tenant not found");
    }
    return (tenant.settings ?? {}) as Record<string, unknown>;
  }

  async updateSettings(
    id: string,
    settings: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<TenantResponse> {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Tenant not found");
    if (!this.permissions.isPlatformAdmin(user) && user.tenantId !== id) {
      throw new NotFoundException("Tenant not found");
    }
    const current =
      existing.settings && typeof existing.settings === "object" && !Array.isArray(existing.settings)
        ? (existing.settings as Record<string, unknown>)
        : {};
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: { settings: { ...current, ...settings } as Prisma.InputJsonValue },
      include: {
        users: {
          where: { userId: user.id },
          select: { role: true, status: true },
          take: 1,
        },
      },
    });
    return this.toResponse(tenant);
  }

  private toResponse(
    tenant: Prisma.TenantGetPayload<{
      include: {
        users: {
          select: { role: true; status: true };
        };
      };
    }>,
  ): TenantResponse {
    const membership = tenant.users[0];

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      type: tenant.type,
      status: tenant.status,
      countryCode: tenant.countryCode,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      membershipRole: membership?.role,
      membershipStatus: membership?.status,
    };
  }
}

@ApiTags("Tenants")
@ApiBearerAuth()
@Controller("tenants")
class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  findAccessibleTenants(
    @Query() filter: TenantFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<TenantResponse>> {
    return this.tenantsService.findAccessibleTenants(user, filter);
  }

  @Get("current")
  findCurrentTenant(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantResponse> {
    return this.tenantsService.findCurrentTenant(user);
  }

  @Get(":id")
  findById(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantResponse> {
    return this.tenantsService.findById(id, user);
  }

  @Patch(":id")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantResponse> {
    return this.tenantsService.update(id, dto, user);
  }

  @Get(":id/settings")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  getSettings(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.tenantsService.getSettings(id, user);
  }

  @Patch(":id/settings")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  updateSettings(
    @Param("id") id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TenantResponse> {
    return this.tenantsService.updateSettings(id, dto, user);
  }
}

@Module({
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
