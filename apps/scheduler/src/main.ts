import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  DealStatus,
  DueDiligenceStatus,
  MediaStatus,
  Prisma,
} from "@prisma/client";

const ImpactReportStatus = { SUBMITTED: "SUBMITTED", VERIFIED: "VERIFIED", REJECTED: "REJECTED" } as const;
import { configuration } from "@evzone/config";
import { PrismaModule, PrismaService } from "@evzone/database";
import { OutboxService } from "@evzone/events";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
  ],
})
class SchedulerModule {}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("Scheduler");
  const app = await NestFactory.createApplicationContext(SchedulerModule, {
    logger: ["error", "warn", "log"],
  });
  const prisma = app.get(PrismaService);
  const outbox = app.get(OutboxService);
  logger.log("Scheduler started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  // ── 1. Close expired live deals ──
  async function closeExpiredDeals() {
    const result = await prisma.deal.updateMany({
      where: { status: DealStatus.LIVE, closesAt: { lte: new Date() } },
      data: { status: DealStatus.CLOSED_SUCCESSFUL },
    });
    if (result.count > 0)
      logger.log(`Closed ${result.count} expired live deal(s)`);
  }

  // ── 2. Stale due diligence reminders ──
  async function checkStaleDueDiligence() {
    const staleCases = await prisma.dueDiligenceCase.findMany({
      where: {
        status: DueDiligenceStatus.IN_PROGRESS,
        dueAt: { lt: new Date() },
      },
      include: { project: true, assignedAssessor: true },
      take: 50,
    });

    for (const dd of staleCases) {
      logger.warn(`Stale due diligence: ${dd.id} past due date`);
      await outbox.create(prisma as any, {
        tenantId: dd.tenantId,
        topic: "due_diligence.overdue",
        eventType: "due_diligence.overdue",
        aggregateType: "due_diligence",
        aggregateId: dd.id,
        payload: {
          caseId: dd.id,
          projectId: dd.projectId,
          daysOverdue: Math.floor(
            (Date.now() - (dd.dueAt?.getTime() ?? 0)) / (1000 * 60 * 60 * 24),
          ),
        },
      });
    }
  }

  // ── 3. Impact report submission reminders ──
  async function checkImpactReportReminders() {
    // Find projects with verified impact reports older than 11 months
    // to remind assessors to submit updated reports
    const projectsNeedingUpdate = await (prisma as any).project.findMany({
      where: {
        impactReport: {
          status: ImpactReportStatus.VERIFIED,
          submittedAt: { lt: new Date(Date.now() - 11 * 30 * 24 * 60 * 60 * 1000) },
        },
      },
      include: { impactReport: true },
      take: 50,
    }) as Array<{ id: string; tenantId: string; impactReport?: { id: string; submittedAt: Date } }>;

    for (const project of projectsNeedingUpdate) {
      const lastSubmitted = project.impactReport?.submittedAt;
      if (lastSubmitted) {
        const monthsSince = Math.floor(
          (Date.now() - lastSubmitted.getTime()) / (30 * 24 * 60 * 60 * 1000),
        );
        logger.log(
          `Impact report reminder: project ${project.id} last submitted ${monthsSince} months ago`,
        );
        await outbox.create(prisma as any, {
          tenantId: project.tenantId,
          topic: "impact.report_reminder",
          eventType: "impact.report_reminder",
          aggregateType: "impact_report",
          aggregateId: project.impactReport?.id ?? "",
          payload: {
            projectId: project.id,
            monthsSinceLastReport: monthsSince,
          },
        });
      }
    }
  }

  // ── 4. Stale media upload cleanup ──
  async function cleanupStaleMedia() {
    const staleMedia = await prisma.mediaAsset.findMany({
      where: {
        status: MediaStatus.PENDING_UPLOAD,
        createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 24 hours
      },
      take: 50,
    });

    for (const media of staleMedia) {
      logger.warn(`Cleaning up stale media upload: ${media.id}`);
      await prisma.mediaAsset.update({
        where: { id: media.id },
        data: { status: MediaStatus.DELETED },
      });
    }
  }

  // ── Main loop ──
  while (running) {
    try {
      await closeExpiredDeals();
      await checkStaleDueDiligence();
      await checkImpactReportReminders();
      await cleanupStaleMedia();
    } catch (err: any) {
      logger.error(`Scheduler error: ${err.message}`);
    }
    await sleep(60_000); // Run every minute
  }
}

void bootstrap();
