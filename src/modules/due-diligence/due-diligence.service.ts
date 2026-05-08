import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { DueDiligenceEngagement } from './entities/due-diligence-engagement.entity';
import { Project } from '@modules/projects/entities/project.entity';
import { User } from '@modules/users/entities/user.entity';
import { AssessorProfile } from '@modules/users/entities/assessor-profile.entity';
import {
  DueDiligenceStatus,
  UserRole,
  ProjectStatus,
  AssessorAvailability,
} from '@common/enums';
import { PaginatedResponse } from '@common/dto/pagination.dto';
import {
  CreateEngagementDto,
  UpdateEngagementDto,
  SubmitReportDto,
  ReviewReportDto,
  EngagementFilterDto,
  AssessorFilterDto,
} from './dto';

@Injectable()
export class DueDiligenceService {
  constructor(
    @InjectRepository(DueDiligenceEngagement)
    private readonly engagementRepo: Repository<DueDiligenceEngagement>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AssessorProfile)
    private readonly assessorProfileRepo: Repository<AssessorProfile>,
  ) {}

  /**
   * Create a new engagement (ADMIN only)
   */
  async createEngagement(dto: CreateEngagementDto): Promise<DueDiligenceEngagement> {
    // Verify project exists
    const project = await this.projectRepo.findOne({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Verify assessor exists and has ASSESSOR role
    const provider = await this.userRepo.findOne({
      where: { id: dto.providerId },
    });
    if (!provider) {
      throw new NotFoundException('Assessor not found');
    }
    if (provider.role !== UserRole.ASSESSOR) {
      throw new BadRequestException('Selected user is not an assessor');
    }

    // Check if project already has an active engagement
    const existingEngagement = await this.engagementRepo
      .createQueryBuilder('engagement')
      .where('engagement.projectId = :projectId', { projectId: dto.projectId })
      .andWhere('engagement.status IN (:...statuses)', {
        statuses: [
          DueDiligenceStatus.ASSIGNED,
          DueDiligenceStatus.IN_PROGRESS,
          DueDiligenceStatus.UNDER_REVIEW,
        ],
      })
      .getOne();
    if (existingEngagement) {
      throw new BadRequestException('Project already has an active engagement');
    }

    const engagement = this.engagementRepo.create({
      projectId: dto.projectId,
      providerId: dto.providerId,
      status: DueDiligenceStatus.ASSIGNED,
      dueDate: new Date(dto.dueDate),
      notes: dto.notes,
      assignedAt: new Date(),
    });

    const saved = await this.engagementRepo.save(engagement);

    // Update project's due diligence status and assigned provider
    await this.projectRepo.update(dto.projectId, {
      dueDiligenceStatus: 'ASSIGNED',
      providerAssignedId: dto.providerId,
    });

    return this.findEngagementById((saved as DueDiligenceEngagement).id);
  }

  /**
   * List engagements with filtering (PROVIDER sees own, ADMIN sees all)
   */
  async findEngagements(
    filter: EngagementFilterDto,
    userId: string,
    userRole: UserRole,
  ): Promise<PaginatedResponse<DueDiligenceEngagement>> {
    const { page = 1, limit = 20, status, providerId, projectId, sortBy = 'createdAt', sortOrder = 'DESC' } = filter;
    const skip = (page - 1) * limit;

    const qb = this.engagementRepo.createQueryBuilder('engagement')
      .leftJoinAndSelect('engagement.project', 'project')
      .leftJoinAndSelect('engagement.provider', 'provider')
      .leftJoinAndSelect('provider.assessorProfile', 'assessorProfile')
      .orderBy(`engagement.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    // Assessors only see their own engagements
    if (userRole === UserRole.ASSESSOR) {
      qb.andWhere('engagement.providerId = :userId', { userId });
    }

    if (status) {
      qb.andWhere('engagement.status = :status', { status });
    }

    if (providerId && userRole === UserRole.ADMIN) {
      qb.andWhere('engagement.providerId = :providerId', { providerId });
    }

    if (projectId) {
      qb.andWhere('engagement.projectId = :projectId', { projectId });
    }

    const [data, total] = await qb.getManyAndCount();

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

  /**
   * Get engagement by ID with project and provider details
   */
  async findEngagementById(id: string): Promise<DueDiligenceEngagement> {
    const engagement = await this.engagementRepo.findOne({
      where: { id },
      relations: ['project', 'provider', 'provider.assessorProfile']
    });

    if (!engagement) {
      throw new NotFoundException('Engagement not found');
    }

    return engagement;
  }

  /**
   * Find engagement by ID with access check
   */
  async findByIdWithAccess(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<DueDiligenceEngagement> {
    const engagement = await this.findEngagementById(id);

    // Assessors can only access their own engagements
    if (userRole === UserRole.ASSESSOR && engagement.providerId !== userId) {
      throw new ForbiddenException('You can only access your own engagements');
    }

    return engagement;
  }

  /**
   * Get engagements for a specific provider
   */
  async findByProvider(
    providerId: string,
    filter: EngagementFilterDto,
  ): Promise<PaginatedResponse<DueDiligenceEngagement>> {
    const filterWithProvider = { ...filter, providerId };
    // Pass ADMIN role to bypass the user restriction and apply our own providerId filter
    return this.findEngagements(filterWithProvider, providerId, UserRole.ADMIN);
  }

  /**
   * Update engagement status/notes (PROVIDER/ADMIN)
   */
  async updateEngagement(
    id: string,
    dto: UpdateEngagementDto,
    userId: string,
    userRole: UserRole,
  ): Promise<DueDiligenceEngagement> {
    const engagement = await this.findByIdWithAccess(id, userId, userRole);

    // Assessors can only update their own engagements and cannot change certain statuses
    if (userRole === UserRole.ASSESSOR) {
      if (engagement.providerId !== userId) {
        throw new ForbiddenException('You can only update your own engagements');
      }
      // Assessors cannot set COMPLETED or REJECTED status
      if (dto.status === DueDiligenceStatus.COMPLETED || dto.status === DueDiligenceStatus.REJECTED) {
        throw new ForbiddenException('Assessors cannot set COMPLETED or REJECTED status');
      }
    }

    // Merge updates
    const updates: Partial<DueDiligenceEngagement> = {};

    if (dto.status !== undefined) {
      updates.status = dto.status;
    }
    if (dto.notes !== undefined) {
      updates.notes = dto.notes;
    }
    if (dto.financialAssessment !== undefined) {
      updates.financialAssessment = dto.financialAssessment as Record<string, any>;
    }
    if (dto.technicalAssessment !== undefined) {
      updates.technicalAssessment = dto.technicalAssessment as Record<string, any>;
    }
    if (dto.legalAssessment !== undefined) {
      updates.legalAssessment = dto.legalAssessment as Record<string, any>;
    }
    if (dto.esgAssessment !== undefined) {
      updates.esgAssessment = dto.esgAssessment as Record<string, any>;
    }
    if (dto.marketAssessment !== undefined) {
      updates.marketAssessment = dto.marketAssessment as Record<string, any>;
    }

    if (Object.keys(updates).length === 0) {
      return engagement;
    }

    await this.engagementRepo.update(id, updates);
    return this.findEngagementById(id);
  }

  /**
   * Start engagement (PROVIDER only) - sets status to IN_PROGRESS
   */
  async startEngagement(
    id: string,
    providerId: string,
  ): Promise<DueDiligenceEngagement> {
    const engagement = await this.findEngagementById(id);

    if (engagement.providerId !== providerId) {
      throw new ForbiddenException('You can only start your own engagements');
    }

    if (engagement.status !== DueDiligenceStatus.ASSIGNED) {
      throw new BadRequestException(`Cannot start engagement with status: ${engagement.status}`);
    }

    await this.engagementRepo.update(id, {
      status: DueDiligenceStatus.IN_PROGRESS,
      startedAt: new Date(),
    });

    // Update project's due diligence status
    await this.projectRepo.update(engagement.projectId, {
      dueDiligenceStatus: 'IN_PROGRESS',
    });

    return this.findEngagementById(id);
  }

  /**
   * Submit report (PROVIDER only)
   */
  async submitReport(
    id: string,
    providerId: string,
    dto: SubmitReportDto,
  ): Promise<DueDiligenceEngagement> {
    const engagement = await this.findEngagementById(id);

    if (engagement.providerId !== providerId) {
      throw new ForbiddenException('You can only submit reports for your own engagements');
    }

    if (engagement.status !== DueDiligenceStatus.IN_PROGRESS && engagement.status !== DueDiligenceStatus.ASSIGNED) {
      throw new BadRequestException(`Cannot submit report for engagement with status: ${engagement.status}`);
    }

    const updates: Partial<DueDiligenceEngagement> = {
      status: DueDiligenceStatus.UNDER_REVIEW,
      submittedAt: new Date(),
    };

    if (dto.financialAssessment !== undefined) {
      updates.financialAssessment = dto.financialAssessment;
    }
    if (dto.technicalAssessment !== undefined) {
      updates.technicalAssessment = dto.technicalAssessment;
    }
    if (dto.legalAssessment !== undefined) {
      updates.legalAssessment = dto.legalAssessment;
    }
    if (dto.esgAssessment !== undefined) {
      updates.esgAssessment = dto.esgAssessment;
    }
    if (dto.marketAssessment !== undefined) {
      updates.marketAssessment = dto.marketAssessment;
    }
    if (dto.overallScore !== undefined) {
      updates.overallScore = dto.overallScore;
    }
    if (dto.riskLevel !== undefined) {
      updates.riskLevel = dto.riskLevel;
    }
    if (dto.notes !== undefined) {
      updates.notes = dto.notes;
    }
    if (dto.reportDocuments !== undefined) {
      updates.reportDocuments = dto.reportDocuments as any;
    }

    await this.engagementRepo.update(id, updates);

    // Update project's due diligence status
    await this.projectRepo.update(engagement.projectId, {
      dueDiligenceStatus: 'IN_PROGRESS',
      dueDiligenceScore: dto.overallScore ?? engagement.overallScore,
    });

    return this.findEngagementById(id);
  }

  /**
   * Review report (ADMIN only) - sets COMPLETED or REJECTED
   */
  async reviewReport(
    id: string,
    dto: ReviewReportDto,
  ): Promise<DueDiligenceEngagement> {
    const engagement = await this.findEngagementById(id);

    if (engagement.status !== DueDiligenceStatus.UNDER_REVIEW) {
      throw new BadRequestException(`Cannot review engagement with status: ${engagement.status}`);
    }

    if (dto.status !== DueDiligenceStatus.COMPLETED && dto.status !== DueDiligenceStatus.REJECTED) {
      throw new BadRequestException('Review status must be either COMPLETED or REJECTED');
    }

    await this.engagementRepo.update(id, {
      status: dto.status,
      reviewedAt: new Date(),
      notes: dto.notes ? (engagement.notes ? `${engagement.notes}\n\nReview: ${dto.notes}` : dto.notes) : engagement.notes,
    });

    // Update project's due diligence status based on review
    if (dto.status === DueDiligenceStatus.COMPLETED) {
      await this.projectRepo.update(engagement.projectId, {
        dueDiligenceStatus: 'COMPLETED',
        dueDiligenceScore: engagement.overallScore,
      });
    } else {
      // REJECTED - set back so provider can resubmit
      await this.projectRepo.update(engagement.projectId, {
        dueDiligenceStatus: 'FAILED',
      });
    }

    return this.findEngagementById(id);
  }

  /**
   * Find projects available for due diligence (ACTIVE or UNDER_REVIEW without provider)
   */
  async findAvailableProjects(): Promise<Project[]> {
    // Find projects that are ACTIVE or UNDER_REVIEW
    // and don't have an active engagement
    const activeProjects = await this.projectRepo
      .createQueryBuilder('project')
      .where('project.status IN (:...statuses)', {
        statuses: [ProjectStatus.ACTIVE, ProjectStatus.UNDER_REVIEW],
      })
      .andWhere(
        'NOT EXISTS (' +
          'SELECT 1 FROM due_diligence_engagements dde ' +
          'WHERE dde.projectId = project.id ' +
          'AND dde.status IN (:...activeStatuses)' +
        ')',
        {
          activeStatuses: [
            DueDiligenceStatus.ASSIGNED,
            DueDiligenceStatus.IN_PROGRESS,
            DueDiligenceStatus.UNDER_REVIEW,
          ],
        },
      )
      .orderBy('project.createdAt', 'DESC')
      .getMany();

    return activeProjects;
  }

  /**
   * Find all providers with their profiles
   */
  async findAssessors(
    filter: AssessorFilterDto,
  ): Promise<PaginatedResponse<User>> {
    const { page = 1, limit = 20, availability, specialties, rating, sortBy = 'createdAt', sortOrder = 'DESC' } = filter;
    const skip = (page - 1) * limit;

    const qb = this.userRepo.createQueryBuilder('user')
      .leftJoinAndSelect('user.assessorProfile', 'assessorProfile')
      .where('user.role = :role', { role: UserRole.ASSESSOR })
      .andWhere('user.status != :suspended', { suspended: 'SUSPENDED' as any })
      .orderBy(`user.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    if (availability) {
      qb.andWhere('assessorProfile.availabilityStatus = :availability', { availability });
    }

    if (specialties) {
      // Handle comma-separated specialties
      const specialtyList = specialties.split(',').map((s) => s.trim());
      qb.andWhere('assessorProfile.specialties && :specialties', { specialties: specialtyList });
    }

    if (rating !== undefined) {
      qb.andWhere('assessorProfile.rating >= :rating', { rating });
    }

    const [data, total] = await qb.getManyAndCount();

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

  /**
   * Get due diligence statistics
   */
  async getStats(): Promise<{
    totalEngagements: number;
    byStatus: Record<string, number>;
    averageScore: number | null;
    completedThisMonth: number;
    completedThisWeek: number;
    inProgressCount: number;
    underReviewCount: number;
    rejectedCount: number;
  }> {
    // Count by status
    const statusCounts = await this.engagementRepo
      .createQueryBuilder('engagement')
      .select('engagement.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('engagement.status')
      .getRawMany();

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    // Total engagements
    const totalEngagements = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    // Average overall score (only for completed/submitted engagements with scores)
    const avgResult = await this.engagementRepo
      .createQueryBuilder('engagement')
      .select('AVG(engagement.overallScore)', 'avg')
      .where('engagement.overallScore IS NOT NULL')
      .getRawOne();
    const averageScore = avgResult.avg ? Math.round(parseFloat(avgResult.avg) * 100) / 100 : null;

    // Completed this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedThisMonth = await this.engagementRepo
      .createQueryBuilder('engagement')
      .where('engagement.status = :status', { status: DueDiligenceStatus.COMPLETED })
      .andWhere('engagement.reviewedAt >= :startOfMonth', { startOfMonth })
      .getCount();

    // Completed this week
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const completedThisWeek = await this.engagementRepo
      .createQueryBuilder('engagement')
      .where('engagement.status = :status', { status: DueDiligenceStatus.COMPLETED })
      .andWhere('engagement.reviewedAt >= :startOfWeek', { startOfWeek })
      .getCount();

    return {
      totalEngagements,
      byStatus,
      averageScore,
      completedThisMonth,
      completedThisWeek,
      inProgressCount: byStatus[DueDiligenceStatus.IN_PROGRESS] || 0,
      underReviewCount: byStatus[DueDiligenceStatus.UNDER_REVIEW] || 0,
      rejectedCount: byStatus[DueDiligenceStatus.REJECTED] || 0,
    };
  }
}
