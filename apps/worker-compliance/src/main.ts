import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  ComplianceAlertSeverity,
  ComplianceAlertStatus,
  ComplianceAlertType,
  ComplianceCaseStatus,
  KycStatus,
  UserStatus,
} from "@prisma/client";
import { configuration } from "@evzone/config";
import { PrismaModule, PrismaService } from "@evzone/database";

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
class WorkerComplianceModule {}

/**
 * Pause execution for the specified duration.
 *
 * @param ms - Delay duration in milliseconds
 */
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface ScreeningResult {
  passed: boolean;
  flags: Array<{ type: string; message: string; severity: ComplianceAlertSeverity }>;
}

/**
 * Start the compliance worker: create the Nest application context and continuously process open compliance cases.
 *
 * The worker retrieves PrismaService, polls for OPEN compliance cases in batches, runs screening on each case,
 * and either auto-approves cases or creates compliance alerts and marks cases for manual review based on screening results.
 * Registers a SIGTERM handler for graceful shutdown and sleeps between polling iterations to control loop cadence.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerCompliance");
  const app = await NestFactory.createApplicationContext(
    WorkerComplianceModule,
    { logger: ["error", "warn", "log"] },
  );
  const prisma = app.get(PrismaService);
  logger.log("Compliance worker started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  while (running) {
    const cases = await prisma.complianceCase.findMany({
      where: { status: ComplianceCaseStatus.OPEN },
      take: 25,
      orderBy: { createdAt: "asc" },
    
    });

    for (const complianceCase of cases) {
      try {
        const result = await runScreening(prisma, complianceCase);

        if (result.passed && result.flags.length === 0) {
          await prisma.complianceCase.update({
            where: { id: complianceCase.id },
            data: {
              status: ComplianceCaseStatus.APPROVED,
              reason: "Auto-approved by compliance screening",
              decidedAt: new Date(),
            },
          });
          logger.log(`Auto-approved compliance case: ${complianceCase.id}`);
        } else {
          // Create alerts for each flag
          for (const flag of result.flags) {
            await prisma.complianceAlert.create({
              data: {
                tenantId: complianceCase.tenantId,
                type: flag.type as ComplianceAlertType,
                severity: flag.severity,
                status: ComplianceAlertStatus.OPEN,
                entityType: "compliance_case",
                entityId: complianceCase.id,
                title: `Compliance Flag: ${flag.type}`,
                description: flag.message,
              },
            });
          }

          await prisma.complianceCase.update({
            where: { id: complianceCase.id },
            data: {
              status: ComplianceCaseStatus.MANUAL_REVIEW,
              reason: `Screening flagged ${result.flags.length} issue(s) for manual review`,
            },
          });
          logger.log(
            `Queued compliance case for manual review: ${complianceCase.id} (${result.flags.length} flags)`,
          );
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          `Failed to process compliance case ${complianceCase.id}: ${message}`,
        );
      }
    }

    await sleep(cases.length > 0 ? 1_000 : 10_000);
  }
}

/**
 * Performs automated compliance screening for a single compliance case and returns any flags requiring attention.
 *
 * Checks performed include: presence of the associated user, KYC verification, account suspension/blocked status,
 * jurisdiction against a high-risk list (placeholder), and tenant open compliance alert volume.
 *
 * @param complianceCase - Object identifying the compliance case to screen (`id`, `tenantId`, and `userId`)
 * @returns `ScreeningResult` containing `passed: true` when no flags were raised, and `flags` describing any detected issues
 */
async function runScreening(
  prisma: PrismaService,
  complianceCase: {
    id: string;
    tenantId: string;
    userId: string | null;
  },
): Promise<ScreeningResult> {
  const flags: ScreeningResult["flags"] = [];

  const user = complianceCase.userId
    ? await prisma.user.findUnique({
        where: { id: complianceCase.userId },
        select: { kycStatus: true, status: true, countryCode: true },
      })
    : null;

  if (!user) {
    flags.push({
      type: "MISSING_USER",
      message: "Compliance case has no associated user",
      severity: ComplianceAlertSeverity.HIGH,
    });
    return { passed: false, flags };
  }

  // 1. KYC verification check
  if (user.kycStatus !== KycStatus.VERIFIED) {
    flags.push({
      type: "KYC_UNVERIFIED",
      message: `User KYC status is ${user.kycStatus}`,
      severity: ComplianceAlertSeverity.HIGH,
    });
  }

  // 2. Account status check
  if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.BLOCKED) {
    flags.push({
      type: "ACCOUNT_SUSPENDED",
      message: `User account status is ${user.status}`,
      severity: ComplianceAlertSeverity.CRITICAL,
    });
  }

  // 3. Jurisdiction screening (placeholder for sanctions list integration)
  const highRiskJurisdictions = ["XX", "YY"]; // Expand with actual OFAC/UN sanctioned jurisdictions
  if (user.countryCode && highRiskJurisdictions.includes(user.countryCode.toUpperCase())) {
    flags.push({
      type: "SANCTIONS_JURISDICTION",
      message: `User jurisdiction ${user.countryCode} is on the high-risk list`,
      severity: ComplianceAlertSeverity.CRITICAL,
    });
  }

  // 4. Open compliance alerts check
  const openAlerts = await prisma.complianceAlert.count({
    where: {
      tenantId: complianceCase.tenantId,
      status: ComplianceAlertStatus.OPEN,
    },
  });
  if (openAlerts > 5) {
    flags.push({
      type: "HIGH_ALERT_VOLUME",
      message: `Tenant has ${openAlerts} open compliance alerts`,
      severity: ComplianceAlertSeverity.MEDIUM,
    });
  }

  return { passed: flags.length === 0, flags };
}

void bootstrap();
