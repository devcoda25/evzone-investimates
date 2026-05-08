import {
  Body,
  Controller,
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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import {
  ComplianceAlertSeverity,
  ComplianceAlertStatus,
  ComplianceAlertType,
  DisputeStatus,
  DisputeType,
  KycStatus,
  PlatformRole,
  Prisma,
  RiskRating,
  TransactionStatus,
  UserStatus,
} from "@prisma/client";
import {
  CurrentUser,
  getLimit,
  getPage,
  PaginatedResponse,
  PaginationDto,
  Roles,
  toPaginationMeta,
  AuthenticatedUser,
} from "@evzone/common";
import { PrismaService } from "@evzone/database";
import { PermissionsService } from "@evzone/permissions";

class AlertFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ComplianceAlertType)
  type?: ComplianceAlertType;

  @IsOptional()
  @IsEnum(ComplianceAlertSeverity)
  severity?: ComplianceAlertSeverity;

  @IsOptional()
  @IsEnum(ComplianceAlertStatus)
  status?: ComplianceAlertStatus;
}

class ResolveAlertDto {
  @IsEnum(ComplianceAlertStatus)
  status!: ComplianceAlertStatus;

  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}

class DisputeFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(DisputeType)
  type?: DisputeType;

  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;
}

class ResolveDisputeDto {
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @IsOptional()
  @IsString()
  resolution?: string;
}

class AuditLogFilterDto extends PaginationDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

class RiskAssessmentDto {
  @IsEnum(RiskRating)
  riskLevel!: RiskRating;

  @IsOptional()
  factors?: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  mitigationPlan?: string;
}

@Injectable()
class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async getDashboard(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const tenantWhere = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
    const [
      usersByRole,
      projectsByStatus,
      investmentsTotal,
      transactionsVolume,
      alertsBySeverity,
      disputesByStatus,
      engagementsByStatus,
    ] = await Promise.all([
      this.prisma.userTenantMembership.groupBy({
        by: ["role"],
        where: this.permissions.isPlatformAdmin(user)
          ? undefined
          : { tenantId: user.tenantId },
        _count: { role: true },
      }),
      this.prisma.project.groupBy({
        by: ["status"],
        where: tenantWhere,
        _count: { status: true },
      }),
      this.prisma.investment.aggregate({
        where: tenantWhere,
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { ...tenantWhere, status: TransactionStatus.COMPLETED },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.complianceAlert.groupBy({
        by: ["severity"],
        where: tenantWhere,
        _count: { severity: true },
      }),
      this.prisma.dispute.groupBy({
        by: ["status"],
        where: tenantWhere,
        _count: { status: true },
      }),
      this.prisma.dueDiligenceCase.groupBy({
        by: ["status"],
        where: tenantWhere,
        _count: { status: true },
      }),
    ]);
    return {
      usersByRole: Object.fromEntries(
        usersByRole.map((row) => [row.role, row._count.role]),
      ),
      projectsByStatus: Object.fromEntries(
        projectsByStatus.map((row) => [row.status, row._count.status]),
      ),
      investmentsTotal: {
        totalAmount: investmentsTotal._sum.amount?.toString() ?? "0",
        totalCount: investmentsTotal._count.id,
      },
      transactionsVolume: {
        totalAmount: transactionsVolume._sum.amount?.toString() ?? "0",
        totalCount: transactionsVolume._count.id,
      },
      alertsBySeverity: Object.fromEntries(
        alertsBySeverity.map((row) => [row.severity, row._count.severity]),
      ),
      disputesByStatus: Object.fromEntries(
        disputesByStatus.map((row) => [row.status, row._count.status]),
      ),
      engagementsByStatus: Object.fromEntries(
        engagementsByStatus.map((row) => [row.status, row._count.status]),
      ),
    };
  }

  async findAlerts(
    filter: AlertFilterDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.ComplianceAlertWhereInput = {
      tenantId: this.permissions.isPlatformAdmin(user)
        ? undefined
        : user.tenantId,
      type: filter.type,
      severity: filter.severity,
      status: filter.status,
    };
    const [data, total] = await Promise.all([
      this.prisma.complianceAlert.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.complianceAlert.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(page, limit, total) };
  }

  async findAlertById(id: string): Promise<unknown> {
    const alert = await this.prisma.complianceAlert.findUnique({
      where: { id },
    });
    if (!alert) throw new NotFoundException("Compliance alert not found");
    return alert;
  }

  async updateAlert(id: string, dto: ResolveAlertDto): Promise<unknown> {
    return this.prisma.complianceAlert.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNotes: dto.resolutionNotes,
        resolvedAt:
          dto.status === ComplianceAlertStatus.RESOLVED ||
          dto.status === ComplianceAlertStatus.DISMISSED
            ? new Date()
            : undefined,
      },
    });
  }

  async getComplianceStats(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const where = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
    const [total, bySeverity, byStatus, kycPending] = await Promise.all([
      this.prisma.complianceAlert.count({ where }),
      this.prisma.complianceAlert.groupBy({
        by: ["severity"],
        where,
        _count: { severity: true },
      }),
      this.prisma.complianceAlert.groupBy({
        by: ["status"],
        where,
        _count: { status: true },
      }),
      this.prisma.user.count({ where: { kycStatus: KycStatus.PENDING } }),
    ]);
    return {
      total,
      bySeverity: Object.fromEntries(
        bySeverity.map((row) => [row.severity, row._count.severity]),
      ),
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count.status]),
      ),
      pendingKycCases: kycPending,
    };
  }

  async findRiskProjects(): Promise<unknown[]> {
    return this.prisma.project.findMany({
      where: { riskRating: null, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async assessRisk(id: string, dto: RiskAssessmentDto): Promise<unknown> {
    return this.prisma.project.update({
      where: { id },
      data: {
        riskRating: dto.riskLevel,
        risks: {
          riskLevel: dto.riskLevel,
          factors: dto.factors ?? [],
          mitigationPlan: dto.mitigationPlan ?? "",
          assessedAt: new Date().toISOString(),
        },
      },
    });
  }

  async getRiskStats(): Promise<Record<string, unknown>> {
    const [assessed, unassessed, critical] = await Promise.all([
      this.prisma.project.count({ where: { riskRating: { not: null } } }),
      this.prisma.project.count({ where: { riskRating: null } }),
      this.prisma.project.count({ where: { riskRating: RiskRating.CRITICAL } }),
    ]);
    return {
      projectsWithRiskAssessment: assessed,
      projectsWithoutDueDiligence: unassessed,
      criticalRiskProjects: critical,
    };
  }

  async findDisputes(
    filter: DisputeFilterDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.DisputeWhereInput = {
      tenantId: this.permissions.isPlatformAdmin(user)
        ? undefined
        : user.tenantId,
      type: filter.type,
      status: filter.status,
    };
    const [data, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        include: { initiator: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(page, limit, total) };
  }

  async findDisputeById(id: string): Promise<unknown> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { initiator: true },
    });
    if (!dispute) throw new NotFoundException("Dispute not found");
    return dispute;
  }

  async updateDispute(id: string, dto: ResolveDisputeDto): Promise<unknown> {
    return this.prisma.dispute.update({
      where: { id },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        resolvedAt:
          dto.status === DisputeStatus.RESOLVED ||
          dto.status === DisputeStatus.CLOSED
            ? new Date()
            : undefined,
      },
    });
  }

  async getDisputeStats(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const where = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
    const [total, byStatus, byType] = await Promise.all([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.groupBy({
        by: ["status"],
        where,
        _count: { status: true },
      }),
      this.prisma.dispute.groupBy({
        by: ["type"],
        where,
        _count: { type: true },
      }),
    ]);
    return {
      total,
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count.status]),
      ),
      byType: Object.fromEntries(
        byType.map((row) => [row.type, row._count.type]),
      ),
    };
  }

  async findAuditLogs(
    filter: AuditLogFilterDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.AuditLogWhereInput = {
      tenantId: this.permissions.isPlatformAdmin(user)
        ? undefined
        : user.tenantId,
      action: filter.action,
      entityType: filter.entityType,
      userId: filter.userId,
    };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(page, limit, total) };
  }

  async findAssessors(
    filter: PaginationDto,
  ): Promise<PaginatedResponse<unknown>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.AssessorProfileWhereInput = filter.search
      ? {
          OR: [
            {
              organizationName: {
                contains: filter.search,
                mode: "insensitive",
              },
            },
            {
              user: { email: { contains: filter.search, mode: "insensitive" } },
            },
            {
              user: {
                firstName: { contains: filter.search, mode: "insensitive" },
              },
            },
            {
              user: {
                lastName: { contains: filter.search, mode: "insensitive" },
              },
            },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.assessorProfile.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.assessorProfile.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(page, limit, total) };
  }

  async findAssessorById(id: string): Promise<unknown> {
    const assessor = await this.prisma.assessorProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!assessor) throw new NotFoundException("Assessor not found");
    return assessor;
  }

  async verifyAssessor(id: string): Promise<unknown> {
    const assessor = await this.prisma.assessorProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!assessor) throw new NotFoundException("Assessor not found");
    await this.prisma.user.update({
      where: { id: assessor.userId },
      data: { kycStatus: KycStatus.VERIFIED },
    });
    return this.findAssessorById(id);
  }

  async suspendAssessor(id: string): Promise<unknown> {
    const assessor = await this.prisma.assessorProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!assessor) throw new NotFoundException("Assessor not found");
    await this.prisma.user.update({
      where: { id: assessor.userId },
      data: { status: UserStatus.SUSPENDED },
    });
    return this.findAssessorById(id);
  }

  async findAllTransactions(
    filter: PaginationDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(page, limit, total) };
  }

  async getTransactionStats(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const where = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
    const [totalCount, totalVolume, byStatus, byType] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.aggregate({
        where: { ...where, status: TransactionStatus.COMPLETED },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["status"],
        where,
        _count: { status: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["type"],
        where,
        _count: { type: true },
      }),
    ]);
    return {
      totalCount,
      totalVolume: totalVolume._sum.amount?.toString() ?? "0",
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count.status]),
      ),
      byType: Object.fromEntries(
        byType.map((row) => [row.type, row._count.type]),
      ),
    };
  }

  async getUserActivities(user: AuthenticatedUser): Promise<unknown[]> {
    return this.prisma.auditLog.findMany({
      where: this.permissions.isPlatformAdmin(user)
        ? {}
        : { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}

@ApiTags("Admin")
@ApiBearerAuth()
@Roles(
  PlatformRole.ADMIN,
  PlatformRole.SUPER_ADMIN,
  PlatformRole.COMPLIANCE_OFFICER,
)
@Controller("admin")
class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("dashboard")
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.adminService.getDashboard(user);
  }

  @Get("compliance/alerts")
  findAlerts(
    @Query() filter: AlertFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    return this.adminService.findAlerts(filter, user);
  }

  @Get("compliance/alerts/:id")
  findAlertById(@Param("id") id: string): Promise<unknown> {
    return this.adminService.findAlertById(id);
  }

  @Patch("compliance/alerts/:id")
  updateAlert(
    @Param("id") id: string,
    @Body() dto: ResolveAlertDto,
  ): Promise<unknown> {
    return this.adminService.updateAlert(id, dto);
  }

  @Get("compliance/stats")
  getComplianceStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.adminService.getComplianceStats(user);
  }

  @Get("risk/projects")
  findRiskProjects(): Promise<unknown[]> {
    return this.adminService.findRiskProjects();
  }

  @Post("risk/projects/:id/assess")
  assessRisk(
    @Param("id") id: string,
    @Body() dto: RiskAssessmentDto,
  ): Promise<unknown> {
    return this.adminService.assessRisk(id, dto);
  }

  @Get("risk/stats")
  getRiskStats(): Promise<Record<string, unknown>> {
    return this.adminService.getRiskStats();
  }

  @Get("disputes")
  findDisputes(
    @Query() filter: DisputeFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    return this.adminService.findDisputes(filter, user);
  }

  @Get("disputes/:id")
  findDisputeById(@Param("id") id: string): Promise<unknown> {
    return this.adminService.findDisputeById(id);
  }

  @Patch("disputes/:id")
  updateDispute(
    @Param("id") id: string,
    @Body() dto: ResolveDisputeDto,
  ): Promise<unknown> {
    return this.adminService.updateDispute(id, dto);
  }

  @Post("disputes/:id/resolve")
  @HttpCode(HttpStatus.OK)
  resolveDispute(
    @Param("id") id: string,
    @Body() dto: ResolveDisputeDto,
  ): Promise<unknown> {
    return this.adminService.updateDispute(id, {
      ...dto,
      status: dto.status ?? DisputeStatus.RESOLVED,
    });
  }

  @Get("disputes/stats")
  getDisputeStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.adminService.getDisputeStats(user);
  }

  @Get("audit-logs")
  findAuditLogs(
    @Query() filter: AuditLogFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    return this.adminService.findAuditLogs(filter, user);
  }

  @Get("assessors")
  findAssessors(
    @Query() filter: PaginationDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.adminService.findAssessors(filter);
  }

  @Get("assessors/:id")
  findAssessorById(@Param("id") id: string): Promise<unknown> {
    return this.adminService.findAssessorById(id);
  }

  @Patch("assessors/:id/verify")
  verifyAssessor(@Param("id") id: string): Promise<unknown> {
    return this.adminService.verifyAssessor(id);
  }

  @Post("assessors/:id/suspend")
  suspendAssessor(@Param("id") id: string): Promise<unknown> {
    return this.adminService.suspendAssessor(id);
  }

  @Get("transactions")
  findAllTransactions(
    @Query() filter: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    return this.adminService.findAllTransactions(filter, user);
  }

  @Get("transactions/stats")
  getTransactionStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.adminService.getTransactionStats(user);
  }

  @Get("user-activities")
  getUserActivities(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.adminService.getUserActivities(user);
  }
}

@Module({
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
