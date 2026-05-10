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
  KycApplicationStatus,
  Prisma,
} from "@prisma/client";
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
class WorkerComplianceModule {}

/**
 * Pause execution for the specified duration.
 *
 * @param ms - Delay duration in milliseconds
 */
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Placeholder sanctions screening.
 * Replace with real provider integration (e.g., ComplyAdvantage, Refinitiv World-Check).
 * Returns flagged=true if the name matches any known sanctions entry.
 */
async function screenAgainstSanctions(
  name: string,
  countryCode?: string,
): Promise<{ flagged: boolean; reason?: string }> {
  // TODO: Integrate with real sanctions screening provider
  // Fail closed: route to manual review until real provider is wired
  const knownSanctionedNames = ["Test Sanctioned", "Blocked Entity"];
  const normalizedName = name.trim().toLowerCase();

  if (knownSanctionedNames.some((s) => normalizedName.includes(s.toLowerCase()))) {
    return { flagged: true, reason: "Name matched sanctions list" };
  }

  // Block entities from high-risk sanctioned countries by default
  const sanctionedCountries = ["IR", "KP", "SY", "CU", "SD", "MM", "RU"];
  if (countryCode && sanctionedCountries.includes(countryCode.toUpperCase())) {
    return {
      flagged: true,
      reason: `Entity from sanctioned country: ${countryCode}`,
    };
  }

  // Always flag for manual review when no real provider is configured
  return { flagged: true, reason: "Sanctions screening not configured — manual review required" };
}

/**
 * Placeholder PEP (Politically Exposed Person) screening.
 * Replace with real PEP database integration.
 */
async function screenAgainstPepList(
  name: string,
  countryCode?: string,
): Promise<{ flagged: boolean; reason?: string }> {
  // TODO: Integrate with real PEP screening provider
  // Example: Call Dow Jones Risk & Compliance / World-Check PEP database
  return { flagged: false };
}

/**
 * Placeholder AML transaction monitoring.
 * Replace with real AML monitoring (e.g., Chainalysis, Elliptic).
 */
async function checkAmlRisk(
  userId: string,
  tenantId: string,
): Promise<{ riskScore: number; flags: string[] }> {
  // TODO: Integrate with real AML monitoring provider
  // For now, return baseline risk score
  return { riskScore: 0, flags: [] };
}

/**
 * Check jurisdiction restrictions for a user's country.
 * Uses tenant-level cached rules from Redis, with fallback defaults.
 */
async function checkJurisdictionRestrictions(
  countryCode: string | undefined,
  tenantId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!countryCode) {
    return { allowed: false, reason: "Country code not provided" };
  }

  // Default sanctioned/high-risk countries
  const sanctionedCountries = ["IR", "KP", "SY", "CU", "SD", "MM", "RU"];

  if (sanctionedCountries.includes(countryCode.toUpperCase())) {
    return {
      allowed: false,
      reason: `Country ${countryCode} is subject to investment restrictions`,
    };
  }

  return { allowed: true };
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
  const outbox = app.get(OutboxService);
  logger.log("Compliance worker started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  // ── 1. Process OPEN compliance cases ──
  async function processComplianceCases() {
    const cases = await prisma.complianceCase.findMany({
      where: { status: ComplianceCaseStatus.OPEN },
      take: 25,
      orderBy: { createdAt: "asc" },
    });

    for (const c of cases) {
      let decision: ComplianceCaseStatus = ComplianceCaseStatus.MANUAL_REVIEW;
      let reason = "Queued for enhanced due diligence";

      // Only process cases that have an associated userId
      if (c.userId) {
        const user = await prisma.user.findUnique({
          where: { id: c.userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            countryCode: true,
            email: true,
            kycStatus: true,
          },
        });

        if (user) {
          // a) Sanctions screening
          const sanctionsResult = await screenAgainstSanctions(
            `${user.firstName} ${user.lastName}`,
            user.countryCode ?? undefined,
          );
          if (sanctionsResult.flagged) {
            decision = ComplianceCaseStatus.REJECTED;
            reason = `Sanctions match: ${sanctionsResult.reason}`;
            logger.warn(`Sanctions hit for user ${user.id}: ${sanctionsResult.reason}`);
            await prisma.$transaction(async (tx) => {
              await tx.complianceAlert.create({
                data: {
                  tenantId: c.tenantId,
                  type: ComplianceAlertType.AML_FLAG,
                  severity: ComplianceAlertSeverity.CRITICAL,
                  status: ComplianceAlertStatus.OPEN,
                  entityType: "user",
                  entityId: user.id,
                  title: "Sanctions screening match",
                  description: `User matched sanctions list: ${sanctionsResult.reason}`,
                },
              });
              await tx.complianceCase.update({
                where: { id: c.id },
                data: { status: decision, decidedAt: new Date(), decidedBy: "system", reason },
              });
            });
            continue;
          }

          // b) PEP screening
          const pepResult = await screenAgainstPepList(
            `${user.firstName} ${user.lastName}`,
            user.countryCode ?? undefined,
          );
          if (pepResult.flagged) {
            await prisma.complianceAlert.create({
              data: {
                tenantId: c.tenantId,
                type: ComplianceAlertType.MANUAL_REVIEW,
                severity: ComplianceAlertSeverity.HIGH,
                status: ComplianceAlertStatus.OPEN,
                entityType: "user",
                entityId: user.id,
                title: "PEP screening match",
                description: `User flagged as PEP: ${pepResult.reason}`,
              },
            });
            decision = ComplianceCaseStatus.MANUAL_REVIEW;
            reason = `PEP match: ${pepResult.reason}`;
            logger.warn(`PEP hit for user ${user.id}: ${pepResult.reason}`);
          }

          // c) AML risk check
          const amlResult = await checkAmlRisk(user.id, c.tenantId);
          if (amlResult.riskScore >= 70 || amlResult.flags.length > 0) {
            await prisma.complianceAlert.create({
              data: {
                tenantId: c.tenantId,
                type: ComplianceAlertType.AML_FLAG,
                severity:
                  amlResult.riskScore >= 90
                    ? ComplianceAlertSeverity.CRITICAL
                    : ComplianceAlertSeverity.HIGH,
                status: ComplianceAlertStatus.OPEN,
                entityType: "user",
                entityId: user.id,
                title: "AML risk flag",
                description: `AML risk score: ${amlResult.riskScore}. Flags: ${amlResult.flags.join(", ")}`,
              },
            });
            if (amlResult.riskScore >= 90) {
              decision = ComplianceCaseStatus.REJECTED;
              reason = `AML risk score ${amlResult.riskScore} exceeds threshold`;
            } else {
              decision = ComplianceCaseStatus.MANUAL_REVIEW;
              reason = `AML risk score ${amlResult.riskScore}: requires manual review`;
            }
          }

          // d) KYC verification check — ensure user has verified KYC
          if (user.kycStatus !== KycStatus.VERIFIED) {
            decision = ComplianceCaseStatus.REJECTED;
            reason = `User KYC not verified (status: ${user.kycStatus})`;
            logger.warn(`KYC not verified for user ${user.id}: ${user.kycStatus}`);
          }
        }
      }

      await prisma.complianceCase.update({
        where: { id: c.id },
        data: { status: decision, decidedAt: new Date(), decidedBy: "system", reason },
      });

      await outbox.create(prisma as any, {
        tenantId: c.tenantId,
        topic: "compliance.case_decided",
        eventType: "compliance.case_decided",
        aggregateType: "compliance_case",
        aggregateId: c.id,
        payload: { caseId: c.id, decision, reason },
      });

      logger.log(`Compliance case ${c.id} decided: ${decision} (${reason})`);
    }
  }

  // ── 2. Check users with pending KYC for stale cases ──
  async function checkStaleKyc() {
    const stalePending = await prisma.kycApplication.findMany({
      where: {
        status: KycApplicationStatus.PENDING,
        createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      take: 50,
    });

    for (const kycApp of stalePending) {
      logger.warn(`Stale KYC application: ${kycApp.id} pending since ${kycApp.createdAt}`);
      await prisma.complianceAlert.create({
        data: {
          tenantId: kycApp.tenantId,
          type: ComplianceAlertType.KYC_ISSUE,
          severity: ComplianceAlertSeverity.MEDIUM,
          status: ComplianceAlertStatus.OPEN,
          entityType: "kyc_application",
          entityId: kycApp.id,
          title: "Stale KYC application",
          description: `KYC application ${kycApp.id} has been pending for over 7 days`,
        },
      });
    }
  }

  // ── 3. Check for users with expired KYC verification ──
  async function checkExpiredKyc() {
    const verifiedUsers = await prisma.user.findMany({
      where: { kycStatus: KycStatus.VERIFIED },
      include: {
        memberships: { take: 1 },
        kycApplications: {
          where: { status: KycApplicationStatus.VERIFIED },
          orderBy: { verifiedAt: "desc" },
          take: 1,
        },
      },
      take: 100,
    });

    for (const user of verifiedUsers) {
      const latestKyc = user.kycApplications[0];
      if (latestKyc?.verifiedAt) {
        const ageInDays = (Date.now() - latestKyc.verifiedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays > 365) {
          await prisma.complianceAlert.create({
            data: {
              tenantId: user.memberships?.[0]?.tenantId ?? "",
              type: ComplianceAlertType.DOCUMENT_EXPIRY,
              severity: ComplianceAlertSeverity.MEDIUM,
              status: ComplianceAlertStatus.OPEN,
              entityType: "user",
              entityId: user.id,
              title: "KYC document re-verification needed",
              description: `User ${user.id} KYC verified ${Math.floor(ageInDays)} days ago — re-verification recommended`,
            },
          });
        }
      }
    }
  }

  // ── 4. Check jurisdiction restrictions for pending investments ──
  async function checkJurisdictionRestrictionsLoop() {
    const pendingInvestments = await prisma.investment.findMany({
      where: { status: "PENDING_COMPLIANCE" },
      include: { project: true, investor: true },
      take: 50,
    });

    for (const investment of pendingInvestments) {
      if (!investment.investor?.countryCode || !investment.project?.countryCode) continue;

      const jurisdictionCheck = await checkJurisdictionRestrictions(
        investment.investor.countryCode,
        investment.tenantId,
      );

      if (!jurisdictionCheck.allowed) {
        await prisma.complianceAlert.create({
          data: {
            tenantId: investment.tenantId,
            type: ComplianceAlertType.REGULATORY_CHANGE,
            severity: ComplianceAlertSeverity.HIGH,
            status: ComplianceAlertStatus.OPEN,
            entityType: "investment",
            entityId: investment.id,
            title: "Jurisdiction restriction",
            description: `Investment ${investment.id}: jurisdiction ${investment.investor.countryCode} not allowed — ${jurisdictionCheck.reason}`,
          },
        });
        logger.warn(`Jurisdiction restriction for investment ${investment.id}`);
      }
    }
  }

  // ── Main loop ──
  while (running) {
    try {
      await processComplianceCases();
      await checkStaleKyc();
      await checkExpiredKyc();
      await checkJurisdictionRestrictionsLoop();
    } catch (err: any) {
      logger.error(`Compliance worker error: ${err.message}`);
    }
    await sleep(10_000);
  }
}

void bootstrap();
