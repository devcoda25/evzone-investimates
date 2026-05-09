import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
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

@Injectable()
class ComplianceService {
  constructor(private readonly adminService: AdminService) {}

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
}

@Module({
  imports: [AdminModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
})
export class ComplianceModule {}
