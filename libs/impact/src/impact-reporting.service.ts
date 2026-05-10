import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@evzone/database";
import { AuditService } from "@evzone/audit";
import { OutboxService } from "@evzone/events";
import { RedisService } from "@evzone/redis";

interface ImpactMetric {
  name: string;
  value: number;
  unit: string;
  baseline?: number;
  target?: number;
}

interface ImpactReportInput {
  projectId: string;
  tenantId: string;
  reportingPeriod: {
    startDate: Date;
    endDate: Date;
  };
  metrics: ImpactMetric[];
  evidenceAttachments?: string[];
  notes?: string;
}

// Type helper for Prisma impact report creation
interface PrismaImpactReportCreateInput {
  tenantId: string;
  projectId: string;
  submittedBy: string;
  reportingPeriodStart: Date;
  reportingPeriodEnd: Date;
  metrics: Prisma.InputJsonValue;
  evidenceAttachments: Prisma.InputJsonValue;
  notes?: string;
  status: string;
  submittedAt: Date;
}

// Type helper for Prisma impact report update
interface PrismaImpactReportUpdateInput {
  status?: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
}

@Injectable()
export class ImpactReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Submit an impact report for a project.
   */
  async submitReport(report: ImpactReportInput, submittedBy: string): Promise<unknown> {
    const project = await this.prisma.project.findUnique({
      where: { id: report.projectId },
    });
    if (!project) throw new Error("Project not found");

    const result = await this.prisma.$transaction(async (tx) => {
      // Create or update impact report
      const impactReport = await (tx as any).impactReport.upsert({
        where: { projectId: report.projectId },
        create: {
          tenantId: report.tenantId,
          projectId: report.projectId,
          submittedBy,
          reportingPeriodStart: report.reportingPeriod.startDate,
          reportingPeriodEnd: report.reportingPeriod.endDate,
          metrics: report.metrics as any,
          evidenceAttachments: (report.evidenceAttachments ?? []) as any,
          notes: report.notes,
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
        update: {
          metrics: report.metrics as any,
          evidenceAttachments: (report.evidenceAttachments ?? []) as any,
          notes: report.notes,
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
      });

      // Cache impact metrics for quick retrieval
      const cacheKey = `impact:metrics:${report.projectId}`;
      await this.redis.setJson(cacheKey, report.metrics, 3600);

      // Emit event
      await this.outbox.create(tx, {
        tenantId: report.tenantId,
        topic: "impact.report_submitted",
        eventType: "impact.report_submitted",
        aggregateType: "impact_report",
        aggregateId: impactReport.id,
        payload: {
          projectId: report.projectId,
          metrics: report.metrics as any,
          submittedBy,
        },
      });

      // Audit log
      await this.audit.record({
        tenantId: report.tenantId,
        userId: submittedBy,
        action: "impact.report_submitted",
        entityType: "impact_report",
        entityId: impactReport.id,
        metadata: {
          projectId: report.projectId,
          metricCount: report.metrics.length,
        },
      });

      return impactReport;
    });

    return result;
  }

  /**
   * Review and verify an impact report.
   */
  async reviewReport(reportId: string, status: "VERIFIED" | "REJECTED", reviewerId: string, notes?: string): Promise<unknown> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.impactReport.update({
        where: { id: reportId },
        data: {
          status,
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
          reviewNotes: notes,
        },
      });

      await this.outbox.create(tx, {
        tenantId: result.tenantId,
        topic: "impact.report_reviewed",
        eventType: "impact.report_reviewed",
        aggregateType: "impact_report",
        aggregateId: reportId,
        payload: { reportId, status, reviewerId },
      });

      await this.audit.record({
        tenantId: result.tenantId,
        userId: reviewerId,
        action: `impact.report_${status.toLowerCase()}`,
        entityType: "impact_report",
        entityId: reportId,
        metadata: { notes },
      });

      return result;
    });

    return updated;
  }

  /**
   * Get impact metrics for a project (cached).
   */
  async getProjectImpact(projectId: string): Promise<unknown> {
    const cacheKey = `impact:metrics:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return { source: "cache", metrics: JSON.parse(cached) };
    }

    const report = await this.prisma.impactReport.findFirst({
      where: { projectId, status: "VERIFIED" },
      orderBy: { submittedAt: "desc" },
    });

    if (report?.metrics) {
      await this.redis.setJson(cacheKey, report.metrics, 3600);
    }

    return { source: "database", metrics: report?.metrics ?? [] };
  }

  /**
   * Get impact summary across all projects for a tenant.
   */
  async getImpactSummary(tenantId: string): Promise<unknown> {
    const reports = await this.prisma.impactReport.findMany({
      where: { tenantId, status: "VERIFIED" },
      include: { project: true },
    });

    const aggregatedMetrics: Record<string, number> = {};
    for (const report of reports) {
      if (report.metrics) {
        for (const metric of report.metrics as any as ImpactMetric[]) {
          aggregatedMetrics[metric.name] = (aggregatedMetrics[metric.name] ?? 0) + metric.value;
        }
      }
    }

    return {
      totalProjects: reports.length,
      aggregatedMetrics,
    };
  }
}