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
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, IsISO8601 } from "class-validator";
import {
  ComplianceAlertSeverity,
  ComplianceAlertStatus,
  ComplianceAlertType,
  DisputeStatus,
  DisputeType,
  KycStatus,
  MembershipStatus,
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
import { JwtAuthGuard, RolesGuard } from "@evzone/auth";
import { PermissionsService } from "@evzone/permissions";

export class AlertFilterDto extends PaginationDto {
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

export class ResolveAlertDto {
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

export class ReportDateRangeDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
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
export class AdminService {
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
      flaggedTransactions,
      openAlerts,
      activeAssessors,
      pendingKyc,
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
      this.getFlaggedTransactionsCount(user),
      this.getOpenAlertsCount(user),
      this.getActiveAssessorsCount(user),
      this.getPendingKycCount(),
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
      flaggedTransactions,
      openAlerts,
      activeAssessors,
      pendingKyc,
    };
  }

  private async getFlaggedTransactionsCount(user: AuthenticatedUser): Promise<number> {
    const where = this.permissions.isPlatformAdmin(user)
      ? { status: TransactionStatus.FLAGGED }
      : { tenantId: user.tenantId, status: TransactionStatus.FLAGGED };
    return this.prisma.transaction.count({ where });
  }

  private async getOpenAlertsCount(user: AuthenticatedUser): Promise<number> {
    const where = this.permissions.isPlatformAdmin(user)
      ? { status: ComplianceAlertStatus.OPEN }
      : { tenantId: user.tenantId, status: ComplianceAlertStatus.OPEN };
    return this.prisma.complianceAlert.count({ where });
  }

  private async getActiveAssessorsCount(user: AuthenticatedUser): Promise<number> {
    return this.prisma.userTenantMembership.count({
      where: {
        tenantId: user.tenantId,
        role: PlatformRole.ASSESSOR,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  private async getPendingKycCount(): Promise<number> {
    return this.prisma.user.count({
      where: {
        kycStatus: KycStatus.PENDING,
      },
    });
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

  async findKycCases(
    user: AuthenticatedUser,
    status?: KycStatus,
  ): Promise<unknown[]> {
    const users = await this.prisma.user.findMany({
      where: {
        kycStatus: status
          ? status
          : { in: [KycStatus.PENDING, KycStatus.NOT_STARTED, KycStatus.REJECTED] },
      },
      include: {
        investorProfile: true,
        entrepreneurProfile: true,
        assessorProfile: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return users.map((u) => {
      let company: string | null = null;
      if (u.entrepreneurProfile) {
        company = u.entrepreneurProfile.companyName;
      } else if (u.assessorProfile) {
        company = u.assessorProfile.organizationName;
      }
      return {
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        status: u.status,
        kycStatus: u.kycStatus,
        country: u.countryCode,
        company,
        documents:
          u.preferences &&
          typeof u.preferences === "object" &&
          !Array.isArray(u.preferences) &&
          "kycDocuments" in u.preferences
            ? (u.preferences as Record<string, unknown>).kycDocuments
            : null,
        registeredDate: u.createdAt,
        lastActive: u.lastLoginAt,
      };
    });
  }

  // ============= Regulatory Reports =============

  private getDateRange(
    dto?: ReportDateRangeDto,
  ): { startDate: Date; endDate: Date } {
    const endDate = dto?.endDate ? new Date(dto.endDate) : new Date();
    const startDate = dto?.startDate
      ? new Date(dto.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startDate, endDate };
  }

  private getTenantWhere(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Record<string, unknown> {
    if (dto?.tenantId && this.permissions.isPlatformAdmin(user)) {
      return { tenantId: dto.tenantId };
    }
    return this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
  }

  async getTransactionSummaryReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    const { startDate, endDate } = this.getDateRange(dto);
    const tenantWhere = this.getTenantWhere(user, dto);

    const [byType, byStatus, volume, byCurrency] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: { ...tenantWhere, createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["status"],
        where: { ...tenantWhere, createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { ...tenantWhere, createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["currency"],
        where: { ...tenantWhere, createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
      }),
    ]);

    return {
      period: { startDate, endDate },
      totalCount: volume._count.id,
      totalVolume: volume._sum.amount?.toString() ?? "0",
      byType: Object.fromEntries(
        byType.map((row) => [
          row.type,
          { count: row._count.id, amount: row._sum.amount?.toString() ?? "0" },
        ]),
      ),
      byStatus: Object.fromEntries(
        byStatus.map((row) => [
          row.status,
          { count: row._count.id, amount: row._sum.amount?.toString() ?? "0" },
        ]),
      ),
      byCurrency: Object.fromEntries(
        byCurrency.map((row) => [
          row.currency,
          { amount: row._sum.amount?.toString() ?? "0" },
        ]),
      ),
    };
  }

  async getSuspiciousActivityReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    const { startDate, endDate } = this.getDateRange(dto);
    const tenantWhere = this.getTenantWhere(user, dto);
    const threshold = 10000; // configurable threshold

    const [largeTransactions, flaggedTransactions, alerts] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          ...tenantWhere,
          createdAt: { gte: startDate, lte: endDate },
          amount: { gte: threshold },
        },
        orderBy: { amount: "desc" },
        take: 50,
      }),
      this.prisma.transaction.findMany({
        where: {
          ...tenantWhere,
          createdAt: { gte: startDate, lte: endDate },
          status: TransactionStatus.FLAGGED,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.complianceAlert.findMany({
        where: {
          ...tenantWhere,
          createdAt: { gte: startDate, lte: endDate },
          severity: { in: [ComplianceAlertSeverity.HIGH, ComplianceAlertSeverity.CRITICAL] },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      period: { startDate, endDate },
      threshold,
      largeTransactions: largeTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount.toString(),
        currency: t.currency,
        status: t.status,
        userId: t.userId,
        createdAt: t.createdAt,
      })),
      flaggedTransactions: flaggedTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount.toString(),
        currency: t.currency,
        status: t.status,
        userId: t.userId,
        createdAt: t.createdAt,
      })),
      complianceAlerts: alerts,
    };
  }

  async getAuditTrailReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    const { startDate, endDate } = this.getDateRange(dto);
    const tenantWhere = this.getTenantWhere(user, dto);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...tenantWhere,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    return {
      period: { startDate, endDate },
      totalCount: logs.length,
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        user: l.user,
        oldValues: l.oldValues,
        newValues: l.newValues,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt,
      })),
    };
  }

  async getKycStatusReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    const tenantWhere = this.getTenantWhere(user, dto);

    const [byStatus, pendingApplications, recentRejections] = await Promise.all([
      this.prisma.user.groupBy({
        by: ["kycStatus"],
        where: tenantWhere,
        _count: { id: true },
      }),
      this.prisma.kycApplication.findMany({
        where: {
          tenantId: tenantWhere.tenantId as string,
          status: { in: ["PENDING" as any, "SUBMITTED" as any, "PROCESSING" as any] },
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.kycApplication.findMany({
        where: {
          tenantId: tenantWhere.tenantId as string,
          status: "REJECTED" as any,
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { rejectedAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.kycStatus, row._count.id]),
      ),
      pendingApplications: pendingApplications.map((a) => ({
        id: a.id,
        user: a.user,
        provider: a.provider,
        status: a.status,
        createdAt: a.createdAt,
      })),
      recentRejections: recentRejections.map((a) => ({
        id: a.id,
        user: a.user,
        provider: a.provider,
        rejectionReason: a.rejectionReason,
        rejectedAt: a.rejectedAt,
      })),
    };
  }

  async getLedgerReconciliationReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    const tenantWhere = this.getTenantWhere(user, dto);

    const accounts = await this.prisma.ledgerAccount.findMany({
      where: tenantWhere,
      include: {
        entries: { select: { direction: true, amount: true, currency: true } },
      },
    });

    const report = accounts.map((acc) => {
      const debits = acc.entries
        .filter((e) => e.direction === "DEBIT")
        .reduce((sum, e) => sum + e.amount.toNumber(), 0);
      const credits = acc.entries
        .filter((e) => e.direction === "CREDIT")
        .reduce((sum, e) => sum + e.amount.toNumber(), 0);
      return {
        id: acc.id,
        name: acc.name,
        ownerType: acc.ownerType,
        ownerId: acc.ownerId,
        currency: acc.currency,
        debits,
        credits,
        balance: debits - credits,
        entryCount: acc.entries.length,
      };
    });

    return {
      accounts: report,
      totalAccounts: report.length,
      totalDebits: report.reduce((sum, r) => sum + r.debits, 0),
      totalCredits: report.reduce((sum, r) => sum + r.credits, 0),
      netBalance: report.reduce((sum, r) => sum + r.balance, 0),
    };
  }

  // ============= Entrepreneur Disputes =============

   async findMyDisputes(
     user: AuthenticatedUser,
     filter: DisputeFilterDto,
   ): Promise<PaginatedResponse<unknown>> {
     const page = getPage(filter);
     const limit = getLimit(filter);
     const where: Prisma.DisputeWhereInput = {
       tenantId: user.tenantId,
       initiatorId: user.id,
       ...(filter.type ? { type: filter.type } : {}),
       ...(filter.status ? { status: filter.status } : {}),
     };

     const [items, total] = await Promise.all([
       this.prisma.dispute.findMany({
         where,
         include: { initiator: true },
         orderBy: { createdAt: "desc" },
         skip: (page - 1) * limit,
         take: limit,
       }),
       this.prisma.dispute.count({ where }),
     ]);

     return { data: items, meta: toPaginationMeta(page, limit, total) };
   }

  async findMyDisputeById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const dispute = await this.prisma.dispute.findFirst({
      where: { id, tenantId: user.tenantId, initiatorId: user.id },
    });
    if (!dispute) throw new NotFoundException("Dispute not found");
    return dispute;
  }

  async createDispute(
    user: AuthenticatedUser,
    dto: {
      type: DisputeType;
      title: string;
      description: string;
      entityType?: string;
      entityId?: string;
      evidence?: Prisma.InputJsonValue;
    },
  ): Promise<unknown> {
    return this.prisma.dispute.create({
      data: {
        tenantId: user.tenantId,
        type: dto.type,
        status: DisputeStatus.OPEN,
        title: dto.title,
        description: dto.description,
        initiatorId: user.id,
        entityType: dto.entityType,
        entityId: dto.entityId,
        evidence: dto.evidence,
      },
    });
  }

  async updateMyDispute(
    id: string,
    user: AuthenticatedUser,
    dto: ResolveDisputeDto,
  ): Promise<unknown> {
    const dispute = await this.prisma.dispute.findFirst({
      where: { id, tenantId: user.tenantId, initiatorId: user.id },
    });
    if (!dispute) throw new NotFoundException("Dispute not found");

    return this.prisma.dispute.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.resolution ? { resolution: dto.resolution } : {}),
        ...(dto.status === DisputeStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
      },
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

  @Get("kyc-cases")
  findKycCases(
    @Query("status") status: KycStatus | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.adminService.findKycCases(user, status);
  }

}

@ApiTags("Disputes")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("disputes")
class DisputesController {
  constructor(private readonly adminService: AdminService) {}

  @Get("my")
  findMyDisputes(
    @Query() filter: DisputeFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    return this.adminService.findMyDisputes(user, filter);
  }

  @Get("my/:id")
  findMyDisputeById(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.adminService.findMyDisputeById(id, user);
  }

  @Post()
  createDispute(
    @Body() dto: { type: DisputeType; title: string; description: string; entityType?: string; entityId?: string; evidence?: Prisma.InputJsonValue },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.adminService.createDispute(user, dto);
  }

  @Patch("my/:id")
  updateMyDispute(
    @Param("id") id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.adminService.updateMyDispute(id, user, dto);
  }
}

@Module({
  controllers: [AdminController, DisputesController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
