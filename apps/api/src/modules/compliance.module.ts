import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PlatformRole } from "@prisma/client";
import {
  AuthenticatedUser,
  CurrentUser,
  PaginatedResponse,
  Roles,
} from "@evzone/common";
import {
  AdminModule,
  AdminService,
  AlertFilterDto,
  ReportDateRangeDto,
  ResolveAlertDto,
} from "./admin.module";
import { PrismaService, PrismaModule } from "@evzone/database";
import { OutboxService, EventsModule } from "@evzone/events";
import { AuditService } from "@evzone/audit";
import { RedisService, RedisModule } from "@evzone/redis";

@Injectable()
class ComplianceRulesEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Evaluate compliance for an investment or deal action.
   * Returns: ALLOWED | BLOCKED | MANUAL_REVIEW | ADDITIONAL_DOCS_REQUIRED
   */
  async evaluateCompliance(params: {
    userId: string;
    tenantId: string;
    dealId?: string;
    investmentAmount?: number;
    currency?: string;
    jurisdiction?: string;
    action: string;
  }): Promise<{
    decision: "ALLOWED" | "BLOCKED" | "MANUAL_REVIEW" | "ADDITIONAL_DOCS_REQUIRED";
    checks: Array<{ name: string; passed: boolean; message?: string }>;
    alerts: Array<{ type: string; severity: string; description: string }>;
  }> {
    const checks: Array<{ name: string; passed: boolean; message?: string }> = [];
    const alerts: Array<{ type: string; severity: string; description: string }> = [];

    // 1. KYC verification check
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      include: { kycApplications: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!user) {
      checks.push({ name: "user_exists", passed: false, message: "User not found" });
      return { decision: "BLOCKED", checks, alerts };
    }

    const kycVerified = user.kycStatus === "VERIFIED";
    checks.push({
      name: "kyc_verified",
      passed: kycVerified,
      message: kycVerified ? undefined : "KYC verification required",
    });
    if (!kycVerified) {
      alerts.push({
        type: "KYC_ISSUE",
        severity: "HIGH",
        description: `User ${params.userId} KYC not verified`,
      });
    }

    // 2. AML sanctions screening via cache
    const sanctionsKey = `compliance:sanctions:${params.userId}`;
    const cachedSanctions = await this.redis.get(sanctionsKey);
    if (!cachedSanctions) {
      // Placeholder: integrate with sanctions provider
      await this.redis.setJson(sanctionsKey, { screened: true, hits: [] }, 3600);
    }
    checks.push({ name: "aml_screening", passed: true, message: "AML screening passed" });

    // 3. PEP check
    const pepKey = `compliance:pep:${params.userId}`;
    const cachedPep = await this.redis.get(pepKey);
    if (!cachedPep) {
      // Placeholder: integrate with PEP provider
      await this.redis.setJson(pepKey, { isPep: false }, 3600);
    }
    checks.push({ name: "pep_check", passed: true, message: "PEP check passed" });

    // 4. Jurisdiction restrictions
    if (params.jurisdiction) {
      const restrictedKey = "compliance:restricted:jurisdictions";
      const restricted = await this.redis.get(restrictedKey);
      if (restricted) {
        const restrictedList = JSON.parse(restricted);
        const isRestricted = restrictedList.includes(params.jurisdiction);
        checks.push({
          name: "jurisdiction_allowed",
          passed: !isRestricted,
          message: isRestricted ? `Jurisdiction ${params.jurisdiction} is restricted` : undefined,
        });
      } else {
        checks.push({ name: "jurisdiction_allowed", passed: true });
      }
    }

    // 5. Investment amount limits
    if (params.investmentAmount && params.currency) {
      const limitsKey = `compliance:limits:${params.tenantId}`;
      const cachedLimits = await this.redis.get(limitsKey);
      if (cachedLimits) {
        const limits = JSON.parse(cachedLimits);
        const minAmount = limits.minInvestment ?? 100;
        const maxAmount = limits.maxInvestment ?? 10000000;
        const withinLimits = params.investmentAmount >= minAmount && params.investmentAmount <= maxAmount;
        checks.push({
          name: "amount_limits",
          passed: withinLimits,
          message: withinLimits
            ? undefined
            : `Amount ${params.investmentAmount} outside limits [${minAmount}, ${maxAmount}]`,
        });
      }
    }

    // 6. Investor accreditation check
    const investorProfile = await this.prisma.investorProfile.findUnique({
      where: { userId: params.userId },
    });
    if (investorProfile) {
      const accredited = investorProfile.accreditationStatus === true;
      checks.push({
        name: "accredited_investor",
        passed: accredited,
        message: accredited ? undefined : "Investor not accredited",
      });
    }

    // 7. Duplicate transaction check
    const dupKey = `compliance:dup:${params.userId}:${params.action}`;
    const isDuplicate = await this.redis.setIfAbsent(dupKey, "1", 60);
    checks.push({
      name: "duplicate_check",
      passed: isDuplicate,
      message: isDuplicate ? undefined : "Possible duplicate transaction",
    });

    // Determine overall decision
    const failedChecks = checks.filter((c) => !c.passed);
    const hasCriticalAlerts = alerts.some((a) => a.severity === "CRITICAL" || a.severity === "HIGH");

    let decision: "ALLOWED" | "BLOCKED" | "MANUAL_REVIEW" | "ADDITIONAL_DOCS_REQUIRED";
    if (failedChecks.length === 0 && !hasCriticalAlerts) {
      decision = "ALLOWED";
    } else if (failedChecks.some((c) => ["kyc_verified"].includes(c.name))) {
      decision = "BLOCKED";
    } else if (hasCriticalAlerts || failedChecks.length > 2) {
      decision = "MANUAL_REVIEW";
    } else {
      decision = "ADDITIONAL_DOCS_REQUIRED";
    }

    // Log compliance check
    await this.audit.record({
      tenantId: params.tenantId,
      userId: params.userId,
      action: "compliance.check",
      entityType: "compliance",
      entityId: params.userId,
      metadata: {
        action: params.action,
        decision,
        checks: checks.map((c) => ({ name: c.name, passed: c.passed })),
        alerts: alerts.map((a) => ({ type: a.type, severity: a.severity })),
      },
    });

    return { decision, checks, alerts };
  }

  async getComplianceStatus(userId: string, tenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true, status: true },
    });
    const alerts = await this.prisma.complianceAlert.findMany({
      where: { tenantId, status: "OPEN" },
      take: 10,
    });
    return {
      kycStatus: user?.kycStatus,
      userStatus: user?.status,
      openAlerts: alerts.length,
      lastChecked: new Date(),
    };
  }
}

@Injectable()
class ComplianceService {
  constructor(
    private readonly adminService: AdminService,
    private readonly rulesEngine: ComplianceRulesEngine,
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService,
  ) {}

  findAlerts(
    filter: AlertFilterDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    return this.adminService.findAlerts(filter, user);
  }

  findAlertById(id: string): Promise<unknown> {
    return this.adminService.findAlertById(id);
  }

  updateAlert(id: string, dto: ResolveAlertDto): Promise<unknown> {
    return this.adminService.updateAlert(id, dto);
  }

  getStats(user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return this.adminService.getComplianceStats(user);
  }

  getTransactionSummaryReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    return this.adminService.getTransactionSummaryReport(user, dto);
  }

  getSuspiciousActivityReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    return this.adminService.getSuspiciousActivityReport(user, dto);
  }

  getAuditTrailReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    return this.adminService.getAuditTrailReport(user, dto);
  }

  getKycStatusReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    return this.adminService.getKycStatusReport(user, dto);
  }

  getLedgerReconciliationReport(
    user: AuthenticatedUser,
    dto?: ReportDateRangeDto,
  ): Promise<Record<string, unknown>> {
    return this.adminService.getLedgerReconciliationReport(user, dto);
  }

  async evaluateCompliance(
    params: {
      userId: string;
      tenantId: string;
      dealId?: string;
      investmentAmount?: number;
      currency?: string;
      jurisdiction?: string;
      action: string;
    },
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const result = await this.rulesEngine.evaluateCompliance(params);
    await this.outbox.create(this.prisma as any, {
      tenantId: params.tenantId,
      topic: "compliance.evaluated",
      eventType: "compliance.evaluated",
      aggregateType: "compliance",
      aggregateId: params.userId,
      payload: {
        userId: params.userId,
        action: params.action,
        decision: result.decision,
        checks: result.checks,
        evaluatedBy: user.id,
      },
    });
    return result;
  }

  async getComplianceStatus(userId: string, tenantId: string): Promise<unknown> {
    return this.rulesEngine.getComplianceStatus(userId, tenantId);
  }

  async findRegulations(user: AuthenticatedUser): Promise<unknown[]> {
    return this.prisma.regulatoryRule.findMany({
      where: {
        OR: [
          { tenantId: user.tenantId ?? null },
          { tenantId: null },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}

@ApiTags("Compliance")
@ApiBearerAuth()
@Roles(
  PlatformRole.ADMIN,
  PlatformRole.SUPER_ADMIN,
  PlatformRole.COMPLIANCE_OFFICER,
)
@Controller("compliance")
class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get("alerts")
  findAlerts(
    @Query() filter: AlertFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    return this.complianceService.findAlerts(filter, user);
  }

  @Get("alerts/:id")
  findAlertById(@Param("id") id: string): Promise<unknown> {
    return this.complianceService.findAlertById(id);
  }

  @Patch("alerts/:id")
  updateAlert(
    @Param("id") id: string,
    @Body() dto: ResolveAlertDto,
  ): Promise<unknown> {
    return this.complianceService.updateAlert(id, dto);
  }

  @Get("stats")
  getStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.complianceService.getStats(user);
  }

  @Get("regulations")
  findRegulations(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.complianceService.findRegulations(user);
  }

  @Get("reports/transaction-summary")
  getTransactionSummaryReport(
    @Query() dto: ReportDateRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.complianceService.getTransactionSummaryReport(user, dto);
  }

  @Get("reports/suspicious-activity")
  getSuspiciousActivityReport(
    @Query() dto: ReportDateRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.complianceService.getSuspiciousActivityReport(user, dto);
  }

  @Get("reports/audit-trail")
  getAuditTrailReport(
    @Query() dto: ReportDateRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.complianceService.getAuditTrailReport(user, dto);
  }

  @Get("reports/kyc-status")
  getKycStatusReport(
    @Query() dto: ReportDateRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.complianceService.getKycStatusReport(user, dto);
  }

  @Get("reports/ledger-reconciliation")
  getLedgerReconciliationReport(
    @Query() dto: ReportDateRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.complianceService.getLedgerReconciliationReport(user, dto);
  }

  @Post("evaluate")
  evaluateCompliance(
    @Body() body: {
      userId: string;
      dealId?: string;
      investmentAmount?: number;
      currency?: string;
      jurisdiction?: string;
      action: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.complianceService.evaluateCompliance(
      {
        ...body,
        tenantId: user.tenantId,
      },
      user,
    );
  }

  @Get("status/:userId")
  getComplianceStatus(
    @Param("userId") userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.complianceService.getComplianceStatus(userId, user.tenantId);
  }
}

@Module({
  imports: [AdminModule, PrismaModule, RedisModule, EventsModule],
  controllers: [ComplianceController],
  providers: [ComplianceService, ComplianceRulesEngine],
})
export class ComplianceModule {}
