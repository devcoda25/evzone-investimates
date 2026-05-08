import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';

import { User } from '@modules/users/entities/user.entity';
import { Project } from '@modules/projects/entities/project.entity';
import { Investment } from '@modules/investments/entities/investment.entity';
import { Transaction } from '@modules/investments/entities/transaction.entity';
import { DueDiligenceEngagement } from '@modules/due-diligence/entities/due-diligence-engagement.entity';
import { AssessorProfile } from '@modules/users/entities/assessor-profile.entity';
import { UserRole, UserStatus, ComplianceAlertSeverity, ComplianceAlertStatus, DisputeStatus, TransactionStatus, KycStatus } from '@common/enums';

import { ComplianceAlert } from './entities/compliance-alert.entity';
import { Dispute } from './entities/dispute.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AlertFilterDto } from './dto/alert-filter.dto';
import { DisputeFilterDto } from './dto/dispute-filter.dto';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { ResolveAlertDto } from './dto/resolve-alert.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { RiskAssessmentDto } from './dto/risk-assessment.dto';
import { PaginationDto, PaginatedResponse } from '@common/dto/pagination.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(ComplianceAlert)
    private readonly complianceAlertRepo: Repository<ComplianceAlert>,
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Investment)
    private readonly investmentRepo: Repository<Investment>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(DueDiligenceEngagement)
    private readonly ddEngagementRepo: Repository<DueDiligenceEngagement>,
    @InjectRepository(AssessorProfile)
    private readonly assessorProfileRepo: Repository<AssessorProfile>,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────

  async getDashboard(): Promise<Record<string, any>> {
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
      this.getUsersByRole(),
      this.getProjectsByStatus(),
      this.getInvestmentsTotal(),
      this.getTransactionsVolume(),
      this.getAlertsBySeverity(),
      this.getDisputesByStatus(),
      this.getEngagementsByStatus(),
      this.getFlaggedTransactionsCount(),
      this.getOpenAlertsCount(),
      this.getActiveAssessorsCount(),
      this.getPendingKycCount(),
    ]);

    return {
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
    };
  }

  private async getUsersByRole(): Promise<Record<string, number>> {
    const result = await this.userRepo
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.role')
      .getRawMany();
    const map: Record<string, number> = {};
    for (const row of result) map[row.role] = parseInt(row.count, 10);
    return map;
  }

  private async getProjectsByStatus(): Promise<Record<string, number>> {
    const result = await this.projectRepo
      .createQueryBuilder('project')
      .select('project.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('project.status')
      .getRawMany();
    const map: Record<string, number> = {};
    for (const row of result) map[row.status] = parseInt(row.count, 10);
    return map;
  }

  private async getInvestmentsTotal(): Promise<{ totalAmount: number; totalCount: number }> {
    const result = await this.investmentRepo
      .createQueryBuilder('inv')
      .select('COALESCE(SUM(inv.amount), 0)', 'totalAmount')
      .addSelect('COUNT(*)', 'totalCount')
      .getRawOne();
    return {
      totalAmount: parseFloat(result.totalAmount) || 0,
      totalCount: parseInt(result.totalCount, 10) || 0,
    };
  }

  private async getTransactionsVolume(): Promise<{ totalAmount: number; totalCount: number }> {
    const result = await this.transactionRepo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.amount), 0)', 'totalAmount')
      .addSelect('COUNT(*)', 'totalCount')
      .where('tx.status = :status', { status: 'COMPLETED' })
      .getRawOne();
    return {
      totalAmount: parseFloat(result.totalAmount) || 0,
      totalCount: parseInt(result.totalCount, 10) || 0,
    };
  }

  private async getAlertsBySeverity(): Promise<Record<string, number>> {
    const result = await this.complianceAlertRepo
      .createQueryBuilder('alert')
      .select('alert.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .groupBy('alert.severity')
      .getRawMany();
    const map: Record<string, number> = {};
    for (const row of result) map[row.severity] = parseInt(row.count, 10);
    return map;
  }

  private async getDisputesByStatus(): Promise<Record<string, number>> {
    const result = await this.disputeRepo
      .createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('d.status')
      .getRawMany();
    const map: Record<string, number> = {};
    for (const row of result) map[row.status] = parseInt(row.count, 10);
    return map;
  }

  private async getEngagementsByStatus(): Promise<Record<string, number>> {
    const result = await this.ddEngagementRepo
      .createQueryBuilder('dd')
      .select('dd.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dd.status')
      .getRawMany();
    const map: Record<string, number> = {};
    for (const row of result) map[row.status] = parseInt(row.count, 10);
    return map;
  }

  private async getFlaggedTransactionsCount(): Promise<number> {
    return this.transactionRepo.count({
      where: { status: TransactionStatus.FLAGGED },
    });
  }

  private async getOpenAlertsCount(): Promise<number> {
    return this.complianceAlertRepo.count({
      where: { status: ComplianceAlertStatus.OPEN },
    });
  }

  private async getActiveAssessorsCount(): Promise<number> {
    return this.userRepo.count({
      where: { role: UserRole.ASSESSOR, status: UserStatus.ACTIVE },
    });
  }

  private async getPendingKycCount(): Promise<number> {
    return this.userRepo.count({
      where: { kycStatus: KycStatus.PENDING },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // KYC CASES
  // ─────────────────────────────────────────────────────────────

  async findKycCases(status?: KycStatus): Promise<any[]> {
    const qb = this.userRepo.createQueryBuilder('user')
      .leftJoinAndSelect('user.investorProfile', 'investorProfile')
      .leftJoinAndSelect('user.entrepreneurProfile', 'entrepreneurProfile')
      .leftJoinAndSelect('user.assessorProfile', 'assessorProfile')
      .where('user.kycStatus IN (:...statuses)', {
        statuses: status ? [status] : [KycStatus.PENDING, KycStatus.NOT_STARTED, KycStatus.REJECTED],
      });

    const users = await qb.orderBy('user.kycSubmittedAt', 'DESC').getMany();

    return users.map((u) => {
      let company: string | null = null;
      if (u.entrepreneurProfile) {
        company = u.entrepreneurProfile.companyName;
      } else if (u.assessorProfile) {
        company = u.assessorProfile.organizationName;
      }
      return {
        id: u.id,
        name: u.fullName,
        email: u.email,
        role: u.role,
        status: u.status,
        kycStatus: u.kycStatus,
        kycSubmittedAt: u.kycSubmittedAt,
        kycVerifiedAt: u.kycVerifiedAt,
        country: u.country,
        company,
        documents: u.preferences?.kycDocuments || null,
        registeredDate: u.createdAt,
        lastActive: u.lastLoginAt,
      };
    });
  }

  // ─────────────────────────────────────────────────────────────
  // COMPLIANCE ALERTS
  // ─────────────────────────────────────────────────────────────

  async findAlerts(filter: AlertFilterDto): Promise<PaginatedResponse<ComplianceAlert>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const skip = (page - 1) * limit;

    const qb = this.complianceAlertRepo.createQueryBuilder('alert');

    if (filter.type) qb.andWhere('alert.type = :type', { type: filter.type });
    if (filter.severity) qb.andWhere('alert.severity = :severity', { severity: filter.severity });
    if (filter.status) qb.andWhere('alert.status = :status', { status: filter.status });

    const [data, total] = await qb
      .orderBy(`alert.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async findAlertById(id: string): Promise<ComplianceAlert> {
    const alert = await this.complianceAlertRepo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException(`Compliance alert with ID "${id}" not found`);
    return alert;
  }

  async updateAlert(id: string, dto: ResolveAlertDto): Promise<ComplianceAlert> {
    const alert = await this.findAlertById(id);
    alert.status = dto.status;
    if (dto.resolutionNotes !== undefined) alert.resolutionNotes = dto.resolutionNotes;
    if (dto.status === ComplianceAlertStatus.RESOLVED || dto.status === ComplianceAlertStatus.DISMISSED) {
      alert.resolvedAt = new Date();
    }
    return this.complianceAlertRepo.save(alert);
  }

  async getComplianceStats(): Promise<Record<string, any>> {
    const [total, bySeverity, byStatus, openHigh] = await Promise.all([
      this.complianceAlertRepo.count(),
      this.complianceAlertRepo
        .createQueryBuilder('a')
        .select('a.severity', 'severity')
        .addSelect('COUNT(*)', 'count')
        .groupBy('a.severity')
        .getRawMany(),
      this.complianceAlertRepo
        .createQueryBuilder('a')
        .select('a.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('a.status')
        .getRawMany(),
      this.complianceAlertRepo.count({
        where: { severity: ComplianceAlertSeverity.HIGH, status: ComplianceAlertStatus.OPEN },
      }),
    ]);

    return {
      total,
      bySeverity: Object.fromEntries(bySeverity.map((r) => [r.severity, parseInt(r.count, 10)])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, parseInt(r.count, 10)])),
      openHighPriority: openHigh,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // RISK ASSESSMENT
  // ─────────────────────────────────────────────────────────────

  async findRiskProjects(): Promise<Project[]> {
    return this.projectRepo.find({
      where: { dueDiligenceScore: IsNull() },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async assessRisk(id: string, dto: RiskAssessmentDto): Promise<Project> {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Project with ID "${id}" not found`);

    project.risks = {
      ...(project.risks || {}),
      riskLevel: dto.riskLevel,
      factors: dto.factors || [],
      mitigationPlan: dto.mitigationPlan || '',
      assessedAt: new Date().toISOString(),
    };

    return this.projectRepo.save(project);
  }

  async getRiskStats(): Promise<Record<string, any>> {
    const [projectsWithRisk, projectsWithoutDDS, highRiskProjects] = await Promise.all([
      this.projectRepo.count({ where: { risks: {} } }),
      this.projectRepo.count({ where: { dueDiligenceScore: IsNull() } }),
      this.projectRepo
        .createQueryBuilder('p')
        .where("p.risks ::jsonb @> :highRisk", { highRisk: '{"riskLevel":"CRITICAL"}' })
        .getCount(),
    ]);

    return {
      projectsWithRiskAssessment: projectsWithRisk,
      projectsWithoutDueDiligence: projectsWithoutDDS,
      criticalRiskProjects: highRiskProjects,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // DISPUTES
  // ─────────────────────────────────────────────────────────────

  async findDisputes(filter: DisputeFilterDto): Promise<PaginatedResponse<Dispute>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const skip = (page - 1) * limit;

    const qb = this.disputeRepo.createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.initiator', 'initiator');

    if (filter.type) qb.andWhere('dispute.type = :type', { type: filter.type });
    if (filter.status) qb.andWhere('dispute.status = :status', { status: filter.status });

    const [data, total] = await qb
      .orderBy(`dispute.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async findDisputeById(id: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id },
      relations: ['initiator'],
    });
    if (!dispute) throw new NotFoundException(`Dispute with ID "${id}" not found`);
    return dispute;
  }

  async updateDispute(id: string, dto: ResolveDisputeDto): Promise<Dispute> {
    const dispute = await this.findDisputeById(id);
    if (dto.status) dispute.status = dto.status;
    if (dto.resolution !== undefined) dispute.resolution = dto.resolution;
    return this.disputeRepo.save(dispute);
  }

  async resolveDispute(id: string, dto: ResolveDisputeDto): Promise<Dispute> {
    const dispute = await this.findDisputeById(id);
    dispute.status = dto.status || DisputeStatus.RESOLVED;
    if (dto.resolution !== undefined) dispute.resolution = dto.resolution;
    dispute.resolvedAt = new Date();
    return this.disputeRepo.save(dispute);
  }

  async getDisputeStats(): Promise<Record<string, any>> {
    const [total, byStatus, byType, avgResolutionTime] = await Promise.all([
      this.disputeRepo.count(),
      this.disputeRepo
        .createQueryBuilder('d')
        .select('d.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('d.status')
        .getRawMany(),
      this.disputeRepo
        .createQueryBuilder('d')
        .select('d.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .groupBy('d.type')
        .getRawMany(),
      this.disputeRepo
        .createQueryBuilder('d')
        .select('AVG(EXTRACT(EPOCH FROM (d.resolvedAt - d.createdAt)) / 3600)', 'avgHours')
        .where('d.resolvedAt IS NOT NULL')
        .getRawOne(),
    ]);

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, parseInt(r.count, 10)])),
      byType: Object.fromEntries(byType.map((r) => [r.type, parseInt(r.count, 10)])),
      averageResolutionHours: parseFloat(avgResolutionTime?.avgHours) || 0,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // AUDIT LOGS
  // ─────────────────────────────────────────────────────────────

  async findAuditLogs(filter: AuditLogFilterDto): Promise<PaginatedResponse<AuditLog>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const skip = (page - 1) * limit;

    const qb = this.auditLogRepo.createQueryBuilder('log');

    if (filter.action) qb.andWhere('log.action = :action', { action: filter.action });
    if (filter.entityType) qb.andWhere('log.entityType = :entityType', { entityType: filter.entityType });
    if (filter.userId) qb.andWhere('log.userId = :userId', { userId: filter.userId });
    if (filter.startDate && filter.endDate) {
      qb.andWhere({ createdAt: Between(new Date(filter.startDate), new Date(filter.endDate)) });
    }

    const [data, total] = await qb
      .orderBy(`log.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async createAuditLog(data: Partial<AuditLog>): Promise<AuditLog> {
    const log = this.auditLogRepo.create(data);
    return this.auditLogRepo.save(log);
  }

  // ─────────────────────────────────────────────────────────────
  // ASSESSORS
  // ─────────────────────────────────────────────────────────────

  async findAssessors(filter: PaginationDto): Promise<PaginatedResponse<AssessorProfile>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const skip = (page - 1) * limit;

    const qb = this.assessorProfileRepo.createQueryBuilder('assessor')
      .leftJoinAndSelect('assessor.user', 'user');

    if (filter.search) {
      qb.andWhere(
        '(assessor.organizationName ILIKE :search OR user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy(`assessor.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async findAssessorById(id: string): Promise<AssessorProfile> {
    const assessor = await this.assessorProfileRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!assessor) throw new NotFoundException(`Assessor with ID "${id}" not found`);
    return assessor;
  }

  async verifyAssessor(id: string): Promise<AssessorProfile> {
    const assessor = await this.findAssessorById(id);
    assessor.user.kycStatus = 'VERIFIED' as any;
    await this.userRepo.save(assessor.user);
    return assessor;
  }

  async suspendAssessor(id: string): Promise<AssessorProfile> {
    const assessor = await this.findAssessorById(id);
    assessor.user.status = UserStatus.SUSPENDED;
    await this.userRepo.save(assessor.user);
    return assessor;
  }

  // ─────────────────────────────────────────────────────────────
  // TRANSACTIONS
  // ─────────────────────────────────────────────────────────────

  async findAllTransactions(filter: PaginationDto): Promise<PaginatedResponse<Transaction>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const skip = (page - 1) * limit;

    const [data, total] = await this.transactionRepo.findAndCount({
      order: { [sortBy]: sortOrder },
      skip,
      take: limit,
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getTransactionStats(): Promise<Record<string, any>> {
    const [totalCount, totalVolume, byStatus, byType] = await Promise.all([
      this.transactionRepo.count(),
      this.transactionRepo
        .createQueryBuilder('tx')
        .select('COALESCE(SUM(tx.amount), 0)', 'volume')
        .where('tx.status = :status', { status: TransactionStatus.COMPLETED })
        .getRawOne(),
      this.transactionRepo
        .createQueryBuilder('tx')
        .select('tx.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('tx.status')
        .getRawMany(),
      this.transactionRepo
        .createQueryBuilder('tx')
        .select('tx.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .groupBy('tx.type')
        .getRawMany(),
    ]);

    return {
      totalCount,
      totalVolume: parseFloat(totalVolume?.volume) || 0,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, parseInt(r.count, 10)])),
      byType: Object.fromEntries(byType.map((r) => [r.type, parseInt(r.count, 10)])),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // USER ACTIVITIES
  // ─────────────────────────────────────────────────────────────

  async getUserActivities(): Promise<AuditLog[]> {
    return this.auditLogRepo.find({
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }
}
