import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums';
import { OidcAuthGuard } from '@common/guards/oidc-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';

import { AdminService } from './admin.service';
import { AlertFilterDto } from './dto/alert-filter.dto';
import { DisputeFilterDto } from './dto/dispute-filter.dto';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { ResolveAlertDto } from './dto/resolve-alert.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { RiskAssessmentDto } from './dto/risk-assessment.dto';
import { PaginationDto } from '@common/dto/pagination.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(OidcAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard metrics' })
  @ApiResponse({ status: 200, description: 'Dashboard metrics returned' })
  async getDashboard() {
    return this.adminService.getDashboard();
  }

  // ─────────────────────────────────────────────────────────────
  // COMPLIANCE ALERTS
  // ─────────────────────────────────────────────────────────────

  @Get('compliance/alerts')
  @ApiOperation({ summary: 'List compliance alerts with filters' })
  @ApiResponse({ status: 200, description: 'List of compliance alerts' })
  async findAlerts(@Query() filter: AlertFilterDto) {
    return this.adminService.findAlerts(filter);
  }

  @Get('compliance/alerts/:id')
  @ApiOperation({ summary: 'Get compliance alert by ID' })
  @ApiResponse({ status: 200, description: 'Compliance alert found' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async findAlertById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.findAlertById(id);
  }

  @Patch('compliance/alerts/:id')
  @ApiOperation({ summary: 'Update compliance alert status' })
  @ApiResponse({ status: 200, description: 'Alert updated' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async updateAlert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveAlertDto,
  ) {
    return this.adminService.updateAlert(id, dto);
  }

  @Get('compliance/stats')
  @ApiOperation({ summary: 'Get compliance statistics' })
  @ApiResponse({ status: 200, description: 'Compliance stats returned' })
  async getComplianceStats() {
    return this.adminService.getComplianceStats();
  }

  // ─────────────────────────────────────────────────────────────
  // RISK ASSESSMENT
  // ─────────────────────────────────────────────────────────────

  @Get('risk/projects')
  @ApiOperation({ summary: 'List projects requiring risk assessment' })
  @ApiResponse({ status: 200, description: 'Risk project list returned' })
  async findRiskProjects() {
    return this.adminService.findRiskProjects();
  }

  @Post('risk/projects/:id/assess')
  @ApiOperation({ summary: 'Submit risk assessment for a project' })
  @ApiResponse({ status: 200, description: 'Risk assessment saved' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async assessRisk(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RiskAssessmentDto,
  ) {
    return this.adminService.assessRisk(id, dto);
  }

  @Get('risk/stats')
  @ApiOperation({ summary: 'Get risk statistics' })
  @ApiResponse({ status: 200, description: 'Risk stats returned' })
  async getRiskStats() {
    return this.adminService.getRiskStats();
  }

  // ─────────────────────────────────────────────────────────────
  // DISPUTES
  // ─────────────────────────────────────────────────────────────

  @Get('disputes')
  @ApiOperation({ summary: 'List disputes with filters' })
  @ApiResponse({ status: 200, description: 'List of disputes' })
  async findDisputes(@Query() filter: DisputeFilterDto) {
    return this.adminService.findDisputes(filter);
  }

  @Get('disputes/:id')
  @ApiOperation({ summary: 'Get dispute by ID' })
  @ApiResponse({ status: 200, description: 'Dispute found' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async findDisputeById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.findDisputeById(id);
  }

  @Patch('disputes/:id')
  @ApiOperation({ summary: 'Update dispute' })
  @ApiResponse({ status: 200, description: 'Dispute updated' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async updateDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.adminService.updateDispute(id, dto);
  }

  @Post('disputes/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a dispute' })
  @ApiResponse({ status: 200, description: 'Dispute resolved' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async resolveDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.adminService.resolveDispute(id, dto);
  }

  @Get('disputes/stats')
  @ApiOperation({ summary: 'Get dispute statistics' })
  @ApiResponse({ status: 200, description: 'Dispute stats returned' })
  async getDisputeStats() {
    return this.adminService.getDisputeStats();
  }

  // ─────────────────────────────────────────────────────────────
  // AUDIT LOGS
  // ─────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({ summary: 'List audit log entries with filters' })
  @ApiResponse({ status: 200, description: 'Audit log entries returned' })
  async findAuditLogs(@Query() filter: AuditLogFilterDto) {
    return this.adminService.findAuditLogs(filter);
  }

  // ─────────────────────────────────────────────────────────────
  // ASSESSORS
  // ─────────────────────────────────────────────────────────────

  @Get('assessors')
  @ApiOperation({ summary: 'List assessors' })
  @ApiResponse({ status: 200, description: 'Assessor list returned' })
  async findAssessors(@Query() filter: PaginationDto) {
    return this.adminService.findAssessors(filter);
  }

  @Get('assessors/:id')
  @ApiOperation({ summary: 'Get assessor by ID' })
  @ApiResponse({ status: 200, description: 'Assessor found' })
  @ApiResponse({ status: 404, description: 'Assessor not found' })
  async findAssessorById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.findAssessorById(id);
  }

  @Patch('assessors/:id/verify')
  @ApiOperation({ summary: 'Verify an assessor' })
  @ApiResponse({ status: 200, description: 'Assessor verified' })
  @ApiResponse({ status: 404, description: 'Assessor not found' })
  async verifyAssessor(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.verifyAssessor(id);
  }

  @Post('assessors/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend an assessor' })
  @ApiResponse({ status: 200, description: 'Assessor suspended' })
  @ApiResponse({ status: 404, description: 'Assessor not found' })
  async suspendAssessor(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.suspendAssessor(id);
  }

  // ─────────────────────────────────────────────────────────────
  // TRANSACTIONS
  // ─────────────────────────────────────────────────────────────

  @Get('transactions')
  @ApiOperation({ summary: 'List all transactions' })
  @ApiResponse({ status: 200, description: 'Transaction list returned' })
  async findAllTransactions(@Query() filter: PaginationDto) {
    return this.adminService.findAllTransactions(filter);
  }

  @Get('transactions/stats')
  @ApiOperation({ summary: 'Get transaction statistics' })
  @ApiResponse({ status: 200, description: 'Transaction stats returned' })
  async getTransactionStats() {
    return this.adminService.getTransactionStats();
  }

  // ─────────────────────────────────────────────────────────────
  // USER ACTIVITIES
  // ─────────────────────────────────────────────────────────────

  @Get('user-activities')
  @ApiOperation({ summary: 'Get recent user activities' })
  @ApiResponse({ status: 200, description: 'User activities returned' })
  async getUserActivities() {
    return this.adminService.getUserActivities();
  }
}
