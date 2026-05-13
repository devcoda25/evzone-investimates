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
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, IsString, IsISO8601 } from "class-validator";
import {
  AssessorAccreditationStatus,
  ComplianceAlertSeverity,
  ComplianceAlertStatus,
  ComplianceAlertType,
  DisputeStatus,
  DisputeType,
  DueDiligenceStatus,
  KycApplicationStatus,
  KycStatus,
  MembershipStatus,
  PlatformRole,
  Prisma,
  ProviderAuditStatus,
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

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}

interface DisputeResponse {
  id: string;
  tenantId: string;
  type: DisputeType;
  status: DisputeStatus;
  title: string;
  description: string;
  initiatorId: string;
  entityType: string | null;
  entityId: string | null;
  evidence: Prisma.JsonValue | null;
  communications: Prisma.JsonValue | null;
  timeline: Prisma.JsonValue | null;
  partyContacts: Prisma.JsonValue | null;
  resolution: string | null;
  resolvedAt: Date | null;
  priority: string | null;
  financialImpact: Prisma.Decimal | null;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
  initiator: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
  } | null;
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

class UpdateAssessorTierDto {
  @IsString()
  tier!: string;
}

class ScheduleAuditDto {
  @IsISO8601()
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateAuditDto {
  @IsOptional()
  @IsEnum(ProviderAuditStatus)
  status?: ProviderAuditStatus;

  @IsOptional()
  @IsISO8601()
  completedDate?: string;

  @IsOptional()
  @IsString()
  auditorName?: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsInt()
  score?: number;

  @IsOptional()
  @IsString()
  recommendations?: string;
}

class AssignKycCaseDto {
  @IsString()
  assignedTo!: string;
}

class EscalateKycCaseDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

class StressTestScenarioDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  interestRateShock?: number;

  @IsOptional()
  defaultRateShock?: number;

  @IsOptional()
  marketDeclinePercent?: number;
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

  async getDashboardCharts(
    user: AuthenticatedUser,
  ): Promise<{ month: string; completed: number; flagged: number }[]> {
    const tenantWhere = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
    const transactions = await this.prisma.transaction.findMany({
      where: tenantWhere,
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    const monthMap = new Map<string, { completed: number; flagged: number }>();
    for (const tx of transactions) {
      const month = tx.createdAt.toLocaleString('en-US', { month: 'short' });
      const entry = monthMap.get(month) ?? { completed: 0, flagged: 0 };
      if (tx.status === TransactionStatus.COMPLETED) entry.completed++;
      if (tx.status === TransactionStatus.FLAGGED) entry.flagged++;
      monthMap.set(month, entry);
    }
    return Array.from(monthMap.entries()).map(([month, counts]) => ({
      month,
      completed: counts.completed,
      flagged: counts.flagged,
    }));
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

  async getRiskFactors(
    user: AuthenticatedUser,
  ): Promise<{ factor: string; impact: number; affected: number; trend: "up" | "down" | "stable" }[]> {
    const tenantWhere = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };

    const [alerts, projects, transactions] = await Promise.all([
      this.prisma.complianceAlert.findMany({
        where: {
          ...tenantWhere,
          status: ComplianceAlertStatus.OPEN,
          type: {
            in: [
              ComplianceAlertType.REGULATORY_CHANGE,
              ComplianceAlertType.KYC_ISSUE,
              ComplianceAlertType.AML_FLAG,
            ],
          },
        },
        select: { type: true, severity: true },
      }),
      this.prisma.project.findMany({
        where: {
          ...tenantWhere,
          riskRating: { in: [RiskRating.HIGH, RiskRating.CRITICAL] },
          deletedAt: null,
        },
        select: { riskRating: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          ...tenantWhere,
          status: TransactionStatus.FLAGGED,
        },
        select: { id: true },
      }),
    ]);

    const alertCounts = new Map<string, number>();
    for (const alert of alerts) {
      alertCounts.set(alert.type, (alertCounts.get(alert.type) || 0) + 1);
    }

    const highProjects = projects.filter(
      (p) => p.riskRating === RiskRating.HIGH,
    ).length;
    const criticalProjects = projects.filter(
      (p) => p.riskRating === RiskRating.CRITICAL,
    ).length;

    const factors: {
      factor: string;
      impact: number;
      affected: number;
      trend: "up" | "down" | "stable";
    }[] = [];

    const regCount = alertCounts.get(ComplianceAlertType.REGULATORY_CHANGE) || 0;
    if (regCount > 0) {
      factors.push({
        factor: "Regulatory Changes",
        impact: Math.min(100, 60 + regCount * 5),
        affected: regCount,
        trend: "stable",
      });
    }

    const kycCount = alertCounts.get(ComplianceAlertType.KYC_ISSUE) || 0;
    if (kycCount > 0) {
      factors.push({
        factor: "KYC Issues",
        impact: Math.min(100, 55 + kycCount * 5),
        affected: kycCount,
        trend: "stable",
      });
    }

    const amlCount = alertCounts.get(ComplianceAlertType.AML_FLAG) || 0;
    if (amlCount > 0) {
      factors.push({
        factor: "Transaction Anomalies",
        impact: Math.min(100, 65 + amlCount * 5),
        affected: amlCount,
        trend: "stable",
      });
    }

    if (criticalProjects > 0) {
      factors.push({
        factor: "Critical Risk Projects",
        impact: Math.min(100, 85 + criticalProjects * 3),
        affected: criticalProjects,
        trend: "stable",
      });
    }

    if (highProjects > 0) {
      factors.push({
        factor: "High Risk Projects",
        impact: Math.min(100, 70 + highProjects * 2),
        affected: highProjects,
        trend: "stable",
      });
    }

    if (transactions.length > 0) {
      factors.push({
        factor: "Flagged Transactions",
        impact: Math.min(100, 50 + transactions.length * 3),
        affected: transactions.length,
        trend: "stable",
      });
    }

    return factors.sort((a, b) => b.impact - a.impact).slice(0, 6);
  }

  async getRiskChanges(
    user: AuthenticatedUser,
  ): Promise<
    {
      projectId: string;
      projectName: string;
      changedAt: string;
      fromRating: string;
      toRating: string;
      reason: string;
    }[]
  > {
    const tenantWhere = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        ...tenantWhere,
        entityType: "Project",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const changes: {
      projectId: string;
      projectName: string;
      changedAt: string;
      fromRating: string;
      toRating: string;
      reason: string;
    }[] = [];
    const projectIds = new Set<string>();

    for (const log of auditLogs) {
      const oldValues =
        (log.oldValues as Record<string, unknown> | null) || {};
      const newValues =
        (log.newValues as Record<string, unknown> | null) || {};
      if (
        oldValues.riskRating !== undefined ||
        newValues.riskRating !== undefined
      ) {
        projectIds.add(log.entityId);
      }
    }

    if (projectIds.size > 0) {
      const projects = await this.prisma.project.findMany({
        where: { id: { in: Array.from(projectIds) } },
        select: { id: true, title: true },
      });
      const projectMap = new Map(projects.map((p) => [p.id, p.title]));

      for (const log of auditLogs) {
        const oldValues =
          (log.oldValues as Record<string, unknown> | null) || {};
        const newValues =
          (log.newValues as Record<string, unknown> | null) || {};
        if (
          oldValues.riskRating !== undefined ||
          newValues.riskRating !== undefined
        ) {
          changes.push({
            projectId: log.entityId,
            projectName: projectMap.get(log.entityId) || "Unknown Project",
            changedAt: log.createdAt.toISOString(),
            fromRating: String(oldValues.riskRating ?? "N/A"),
            toRating: String(newValues.riskRating ?? "N/A"),
            reason:
              ((log.metadata as Record<string, unknown> | null)
                ?.reason as string) || "Risk assessment updated",
          });
        }
      }
    }

    if (changes.length === 0) {
      const fallbackProjects = await this.prisma.project.findMany({
        where: {
          ...tenantWhere,
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          riskRating: true,
          status: true,
          updatedAt: true,
          createdAt: true,
        },
      });

      const recentProjects = fallbackProjects.filter(
        (p) => p.updatedAt.getTime() - p.createdAt.getTime() > 60000,
      );

      return recentProjects.map((p) => ({
        projectId: p.id,
        projectName: p.title,
        changedAt: p.updatedAt.toISOString(),
        fromRating: p.riskRating ?? "N/A",
        toRating: p.riskRating ?? "N/A",
        reason: `Project ${p.status.toLowerCase()} updated`,
      }));
    }

    return changes.slice(0, 10);
  }

  async getRiskInvestors(
    user: AuthenticatedUser,
  ): Promise<{ investorId: string; name: string; commitment: number }[]> {
    const tenantWhere = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };

    const grouped = await this.prisma.investment.groupBy({
      by: ["investorUserId"],
      where: tenantWhere,
      _sum: { amount: true },
    });

    const investorIds = grouped.map((g) => g.investorUserId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: investorIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );

    const result = grouped.map((g) => ({
      investorId: g.investorUserId,
      name: userMap.get(g.investorUserId) || "Unknown",
      commitment: g._sum.amount?.toNumber() ?? 0,
    }));

    return result
      .sort((a, b) => b.commitment - a.commitment)
      .slice(0, 8);
  }

  async getRiskCounterparties(
    user: AuthenticatedUser,
  ): Promise<{ name: string; limit: number; exposure: number }[]> {
    const tenantWhere = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };

    const grouped = await this.prisma.investment.groupBy({
      by: ["investorUserId"],
      where: tenantWhere,
      _sum: { amount: true },
    });

    const investorIds = grouped.map((g) => g.investorUserId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: investorIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );

    const result = grouped.map((g) => {
      const exposure = g._sum.amount?.toNumber() ?? 0;
      return {
        name: userMap.get(g.investorUserId) || "Unknown",
        limit: Math.max(5000000, exposure * 2),
        exposure,
      };
    });

    return result
      .sort((a, b) => b.exposure - a.exposure)
      .slice(0, 6);
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
        include: {
          initiator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(page, limit, total) };
  }

  async findDisputeById(id: string): Promise<DisputeResponse> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { initiator: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } } },
    });
    if (!dispute) throw new NotFoundException("Dispute not found");
    return dispute as DisputeResponse;
  }

  async updateDispute(id: string, dto: ResolveDisputeDto): Promise<unknown> {
    return this.prisma.dispute.update({
      where: { id },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        priority: dto.priority,
        assignedTo: dto.assignedTo,
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
    const [profiles, total] = await Promise.all([
      this.prisma.assessorProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatar: true,
              status: true,
              kycStatus: true,
              countryCode: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.assessorProfile.count({ where }),
    ]);
    return { data: profiles, meta: toPaginationMeta(page, limit, total) };
  }

  async findAssessorById(id: string): Promise<unknown> {
    const assessor = await this.prisma.assessorProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatar: true,
            status: true,
            kycStatus: true,
            countryCode: true,
            createdAt: true,
          },
        },
      },
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
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: assessor.userId },
        data: { kycStatus: KycStatus.VERIFIED },
      }),
      this.prisma.assessorProfile.update({
        where: { id },
        data: { accreditationStatus: AssessorAccreditationStatus.ACCREDITED },
      }),
    ]);
    return this.findAssessorById(id);
  }

  async updateAssessorTier(id: string, dto: UpdateAssessorTierDto): Promise<unknown> {
    const assessor = await this.prisma.assessorProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!assessor) throw new NotFoundException("Assessor not found");
    await this.prisma.assessorProfile.update({
      where: { id },
      data: { tier: dto.tier },
    });
    return this.findAssessorById(id);
  }

  async scheduleAudit(assessorId: string, dto: ScheduleAuditDto): Promise<unknown> {
    const assessor = await this.prisma.assessorProfile.findUnique({
      where: { id: assessorId },
    });
    if (!assessor) throw new NotFoundException("Assessor not found");
    const audit = await this.prisma.providerAudit.create({
      data: {
        assessorId,
        scheduledDate: new Date(dto.scheduledDate),
        findings: dto.notes,
      },
    });
    return audit;
  }

  async getProviderAudits(assessorId: string): Promise<unknown> {
    const assessor = await this.prisma.assessorProfile.findUnique({
      where: { id: assessorId },
    });
    if (!assessor) throw new NotFoundException("Assessor not found");
    const audits = await this.prisma.providerAudit.findMany({
      where: { assessorId },
      orderBy: { scheduledDate: 'desc' },
    });
    return audits;
  }

  async updateAudit(id: string, dto: UpdateAuditDto): Promise<unknown> {
    const audit = await this.prisma.providerAudit.findUnique({
      where: { id },
    });
    if (!audit) throw new NotFoundException("Audit not found");
    const updated = await this.prisma.providerAudit.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.completedDate && { completedDate: new Date(dto.completedDate) }),
        ...(dto.auditorName !== undefined && { auditorName: dto.auditorName }),
        ...(dto.findings !== undefined && { findings: dto.findings }),
        ...(dto.score !== undefined && { score: dto.score }),
        ...(dto.recommendations !== undefined && { recommendations: dto.recommendations }),
      },
    });
    return updated;
  }

  async suspendAssessor(id: string): Promise<unknown> {
    const assessor = await this.prisma.assessorProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!assessor) throw new NotFoundException("Assessor not found");
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: assessor.userId },
        data: { status: UserStatus.SUSPENDED },
      }),
      this.prisma.assessorProfile.update({
        where: { id },
        data: { accreditationStatus: AssessorAccreditationStatus.SUSPENDED },
      }),
    ]);
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
        kycApplications: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const userIds = users.map((u) => u.id);
    const allAlerts = userIds.length > 0
      ? await this.prisma.complianceAlert.findMany({
          where: { entityId: { in: userIds }, entityType: "user" },
        })
      : [];

    const alertsByUser = new Map<string, typeof allAlerts>();
    for (const alert of allAlerts) {
      const list = alertsByUser.get(alert.entityId) ?? [];
      list.push(alert);
      alertsByUser.set(alert.entityId, list);
    }

    return users.map((u) => {
      let company: string | null = null;
      if (u.entrepreneurProfile) {
        company = u.entrepreneurProfile.companyName;
      } else if (u.assessorProfile) {
        company = u.assessorProfile.organizationName;
      }

      const latestKyc = u.kycApplications[0];
      const alerts = alertsByUser.get(u.id) ?? [];
      const riskFlags = alerts
        .filter((a) => a.severity === ComplianceAlertSeverity.HIGH || a.severity === ComplianceAlertSeverity.CRITICAL)
        .map((a) => ({ type: a.type, severity: a.severity, title: a.title }));

      const submittedData = latestKyc?.submittedData;
      const documentsReceived =
        submittedData &&
        typeof submittedData === "object" &&
        !Array.isArray(submittedData) &&
        "documents" in submittedData
          ? (submittedData as Record<string, unknown>).documents
          : [];

      const priority =
        riskFlags.length > 2
          ? "critical"
          : riskFlags.length > 0
            ? "high"
            : u.riskLevel === RiskRating.HIGH || u.riskLevel === RiskRating.CRITICAL
              ? "high"
              : "medium";

      return {
        id: u.id,
        userName: `${u.firstName} ${u.lastName}`.trim(),
        userRole: u.investorProfile ? "investor" : u.entrepreneurProfile ? "entrepreneur" : u.assessorProfile ? "provider" : "unknown",
        email: u.email,
        status: u.status,
        kycStatus: u.kycStatus,
        jurisdiction: u.countryCode,
        company,
        priority,
        assignedTo: alerts.find((a) => a.assignedTo)?.assignedTo ?? null,
        submittedDate: latestKyc?.createdAt ?? u.createdAt,
        documentsReceived: Array.isArray(documentsReceived) ? documentsReceived.length : 0,
        documentsRequired: 5,
        riskFlags,
        notes: latestKyc?.rejectionReason ?? null,
        registeredDate: u.createdAt,
        lastActive: u.lastLoginAt,
      };
    });
  }

  async assignKycCase(
    authUser: AuthenticatedUser,
    userId: string,
    dto: AssignKycCaseDto,
  ): Promise<unknown> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const existingAlert = await this.prisma.complianceAlert.findFirst({
      where: { entityId: userId, entityType: "USER" },
      orderBy: { createdAt: "desc" },
    });

    if (existingAlert) {
      await this.prisma.complianceAlert.update({
        where: { id: existingAlert.id },
        data: { assignedTo: dto.assignedTo },
      });
    } else {
      await this.prisma.complianceAlert.create({
        data: {
          tenantId: authUser.tenantId,
          type: ComplianceAlertType.KYC_ISSUE,
          severity: ComplianceAlertSeverity.MEDIUM,
          status: ComplianceAlertStatus.OPEN,
          entityType: "USER",
          entityId: userId,
          title: "KYC Case Assignment",
          description: "KYC case assigned for manual review",
          assignedTo: dto.assignedTo,
        },
      });
    }

    return { success: true, userId, assignedTo: dto.assignedTo };
  }

  async escalateKycCase(
    authUser: AuthenticatedUser,
    userId: string,
    dto: EscalateKycCaseDto,
  ): Promise<unknown> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    await this.prisma.complianceAlert.create({
      data: {
        tenantId: authUser.tenantId,
        type: ComplianceAlertType.KYC_ISSUE,
        severity: ComplianceAlertSeverity.CRITICAL,
        status: ComplianceAlertStatus.OPEN,
        entityType: "USER",
        entityId: userId,
        title: "KYC Case Escalated",
        description: dto.reason || "KYC case manually escalated by compliance officer",
      },
    });

    return { success: true, userId, escalated: true };
  }

  async stressTest(
    user: AuthenticatedUser,
    dto: StressTestScenarioDto,
  ): Promise<Record<string, unknown>> {
    const tenantWhere = this.permissions.isPlatformAdmin(user) ? {} : { tenantId: user.tenantId };
    const [projects, investments] = await Promise.all([
      this.prisma.project.findMany({
        where: { ...tenantWhere, deletedAt: null },
        include: { investments: true, deals: true },
      }),
      this.prisma.investment.findMany({
        where: { ...tenantWhere, status: { not: "CANCELLED" as any } },
      }),
    ]);

    const totalPortfolioValue = investments.reduce(
      (sum, inv) => sum + inv.amount.toNumber(),
      0,
    );

    const scenarioMultiplier = 1 - (dto.marketDeclinePercent ?? 0) / 100;
    const stressedPortfolioValue = totalPortfolioValue * scenarioMultiplier;
    const defaultRate = Math.min(
      ((dto.defaultRateShock ?? 0) + (dto.interestRateShock ?? 0) * 0.5) / 100,
      1,
    );
    const estimatedLosses = stressedPortfolioValue * defaultRate;
    const recoveryRate = 0.4;
    const navImpact = estimatedLosses * (1 - recoveryRate);

    const sectorBreakdown = projects.reduce((acc, project) => {
      const sector = project.sector;
      const projectInvestments = project.investments.reduce(
        (sum, inv) => sum + inv.amount.toNumber(),
        0,
      );
      if (!acc[sector]) acc[sector] = 0;
      acc[sector] += projectInvestments * scenarioMultiplier;
      return acc;
    }, {} as Record<string, number>);

    return {
      scenario: dto.name ?? "Custom Stress Test",
      parameters: {
        interestRateShock: dto.interestRateShock ?? 0,
        defaultRateShock: dto.defaultRateShock ?? 0,
        marketDeclinePercent: dto.marketDeclinePercent ?? 0,
      },
      results: {
        totalPortfolioValue,
        stressedPortfolioValue,
        defaultRate: defaultRate * 100,
        estimatedLosses,
        recoveryRate: recoveryRate * 100,
        navImpact,
      },
      sectorBreakdown,
      projectCount: projects.length,
      investmentCount: investments.length,
    };
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
          status: { in: [KycApplicationStatus.PENDING, KycApplicationStatus.SUBMITTED, KycApplicationStatus.PROCESSING] },
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
          status: KycApplicationStatus.REJECTED,
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

  private toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
    ];
    return lines.join("\n");
  }

  async exportData(user: AuthenticatedUser): Promise<{ filename: string; csv: string }> {
    const tenantWhere = this.getTenantWhere(user);

    const [users, transactions, projects] = await Promise.all([
      this.prisma.user.findMany({
        where: tenantWhere,
        include: { memberships: { select: { role: true }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 10000,
      }),
      this.prisma.transaction.findMany({
        where: tenantWhere,
        select: { id: true, type: true, amount: true, currency: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10000,
      }),
      this.prisma.project.findMany({
        where: { ...tenantWhere, deletedAt: null },
        select: { id: true, title: true, sector: true, status: true, fundingTarget: true, currency: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10000,
      }),
    ]);

    const userRows = users.map((u) => ({
      entity: "user",
      id: u.id,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`.trim(),
      status: u.status,
      kycStatus: u.kycStatus,
      role: u.memberships[0]?.role ?? "",
      createdAt: u.createdAt.toISOString(),
    }));

    const txRows = transactions.map((t) => ({
      entity: "transaction",
      id: t.id,
      type: t.type,
      amount: t.amount.toString(),
      currency: t.currency,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    }));

    const projectRows = projects.map((p) => ({
      entity: "project",
      id: p.id,
      title: p.title,
      sector: p.sector,
      status: p.status,
      fundingTarget: p.fundingTarget.toString(),
      currency: p.currency,
      createdAt: p.createdAt.toISOString(),
    }));

    return {
      filename: `evzone-export-${new Date().toISOString().split("T")[0]}.csv`,
      csv: this.toCsv([...userRows, ...txRows, ...projectRows]),
    };
  }

  async exportAuditLogs(user: AuthenticatedUser): Promise<{ filename: string; csv: string }> {
    const tenantWhere = this.getTenantWhere(user);
    const logs = await this.prisma.auditLog.findMany({
      where: tenantWhere,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const rows = logs.map((l) => ({
      id: l.id,
      timestamp: l.createdAt.toISOString(),
      user: l.user ? `${l.user.firstName} ${l.user.lastName}`.trim() : "System",
      email: l.user?.email ?? "",
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      ipAddress: l.ipAddress ?? "",
    }));

    return {
      filename: `evzone-audit-logs-${new Date().toISOString().split("T")[0]}.csv`,
      csv: this.toCsv(rows),
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
         include: {
           initiator: {
             select: {
               id: true,
               firstName: true,
               lastName: true,
               email: true,
               avatar: true,
             },
           },
         },
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

  @Get("dashboard/charts")
  getDashboardCharts(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ month: string; completed: number; flagged: number }[]> {
    return this.adminService.getDashboardCharts(user);
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

  @Post("risk/stress-test")
  @HttpCode(HttpStatus.OK)
  stressTest(
    @Body() dto: StressTestScenarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.adminService.stressTest(user, dto);
  }

  @Get("risk/factors")
  getRiskFactors(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<
    { factor: string; impact: number; affected: number; trend: "up" | "down" | "stable" }[]
  > {
    return this.adminService.getRiskFactors(user);
  }

  @Get("risk/changes")
  getRiskChanges(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<
    {
      projectId: string;
      projectName: string;
      changedAt: string;
      fromRating: string;
      toRating: string;
      reason: string;
    }[]
  > {
    return this.adminService.getRiskChanges(user);
  }

  @Get("risk/investors")
  getRiskInvestors(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ investorId: string; name: string; commitment: number }[]> {
    return this.adminService.getRiskInvestors(user);
  }

  @Get("risk/counterparties")
  getRiskCounterparties(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ name: string; limit: number; exposure: number }[]> {
    return this.adminService.getRiskCounterparties(user);
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

  @Patch("assessors/:id/tier")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  updateAssessorTier(
    @Param("id") id: string,
    @Body() dto: UpdateAssessorTierDto,
  ): Promise<unknown> {
    return this.adminService.updateAssessorTier(id, dto);
  }

  @Post("assessors/:id/audits")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  scheduleAudit(
    @Param("id") id: string,
    @Body() dto: ScheduleAuditDto,
  ): Promise<unknown> {
    return this.adminService.scheduleAudit(id, dto);
  }

  @Get("assessors/:id/audits")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  getProviderAudits(@Param("id") id: string): Promise<unknown> {
    return this.adminService.getProviderAudits(id);
  }

  @Patch("audits/:id")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  updateAudit(
    @Param("id") id: string,
    @Body() dto: UpdateAuditDto,
  ): Promise<unknown> {
    return this.adminService.updateAudit(id, dto);
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

  @Patch("kyc-cases/:id/assign")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN, PlatformRole.COMPLIANCE_OFFICER)
  assignKycCase(
    @Param("id") id: string,
    @Body() dto: AssignKycCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.adminService.assignKycCase(user, id, dto);
  }

  @Patch("kyc-cases/:id/escalate")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN, PlatformRole.COMPLIANCE_OFFICER)
  escalateKycCase(
    @Param("id") id: string,
    @Body() dto: EscalateKycCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.adminService.escalateKycCase(user, id, dto);
  }

  @Get("export/data")
  async exportData(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.adminService.exportData(user);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get("export/audit-logs")
  async exportAuditLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.adminService.exportAuditLogs(user);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
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
