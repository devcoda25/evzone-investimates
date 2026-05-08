import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Project } from './entities/project.entity';
import { Milestone } from './entities/milestone.entity';
import {
  CreateProjectDto,
  UpdateProjectDto,
  ProjectFilterDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto';
import { ProjectStatus, ProjectSector, UserRole, MilestoneStatus } from '@common/enums';
import { PaginatedResponse, PaginationDto } from '@common/dto/pagination.dto';
import { User } from '@modules/users/entities/user.entity';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Milestone)
    private readonly milestoneRepo: Repository<Milestone>,
  ) {}

  // ───────────────────────────────────────────────
  // Projects
  // ───────────────────────────────────────────────

  async create(entrepreneurId: string, dto: CreateProjectDto): Promise<Project> {
    const slug = this.generateSlug(dto.title);

    // Check slug uniqueness
    const existing = await this.projectRepo.findOne({ where: { slug }, withDeleted: true });
    if (existing) {
      throw new ConflictException('A project with a similar title already exists');
    }

    const project = this.projectRepo.create({
      ...dto,
      slug,
      entrepreneurId,
      status: ProjectStatus.DRAFT,
      fundingRaised: 0,
    });

    const saved = await this.projectRepo.save(project);
    this.logger.log(`Project created: ${saved.title} by ${entrepreneurId}`);
    return saved;
  }

  async findAll(filter: ProjectFilterDto, user?: User): Promise<PaginatedResponse<Project>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.projectRepo.createQueryBuilder('project');

    // Public filter: only show active/funded/completed unless admin
    const isAdmin = user?.role === UserRole.ADMIN;
    if (!isAdmin) {
      qb.where('project.status IN (:...publicStatuses)', {
        publicStatuses: [ProjectStatus.ACTIVE, ProjectStatus.FUNDED, ProjectStatus.COMPLETED],
      });
    }

    // Apply filters
    if (filter.status) {
      qb.andWhere('project.status = :status', { status: filter.status });
    }
    if (filter.sector) {
      qb.andWhere('project.sector = :sector', { sector: filter.sector });
    }
    if (filter.stage) {
      qb.andWhere('project.stage = :stage', { stage: filter.stage });
    }
    if (filter.country) {
      qb.andWhere('project.country ILIKE :country', { country: `%${filter.country}%` });
    }
    if (filter.entrepreneurId) {
      qb.andWhere('project.entrepreneurId = :entrepreneurId', { entrepreneurId: filter.entrepreneurId });
    }
    if (filter.mine && user) {
      qb.andWhere('project.entrepreneurId = :mineId', { mineId: user.id });
    }
    if (filter.search) {
      qb.andWhere(
        new Brackets((sqb) => {
          sqb.where('project.title ILIKE :search', { search: `%${filter.search}%` })
            .orWhere('project.description ILIKE :search', { search: `%${filter.search}%` })
            .orWhere('project.country ILIKE :search', { search: `%${filter.search}%` });
        }),
      );
    }

    // Exclude soft-deleted
    qb.andWhere('project.deletedAt IS NULL');

    // Featured ordering
    if (filter.featured) {
      qb.addOrderBy('project.featured', 'DESC');
      qb.addOrderBy('project.featuredOrder', 'ASC');
    }

    qb.orderBy(`project.${sortBy}`, sortOrder);

    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();

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

  async findFeatured(): Promise<Project[]> {
    return this.projectRepo.find({
      where: { featured: true, status: ProjectStatus.ACTIVE },
      order: { featuredOrder: 'ASC' },
      take: 6,
    });
  }

  async findOne(id: string, user?: User): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['milestones'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check visibility
    const isOwner = user && project.entrepreneurId === user.id;
    const isAdmin = user?.role === UserRole.ADMIN;
    const isPublic = [ProjectStatus.ACTIVE, ProjectStatus.FUNDED, ProjectStatus.COMPLETED].includes(project.status);

    if (!isPublic && !isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Increment view count
    if (!isOwner) {
      project.viewCount += 1;
      await this.projectRepo.save(project);
    }

    return project;
  }

  async findOneFull(id: string, user?: User): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['milestones', 'entrepreneur'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isOwner = user && project.entrepreneurId === user.id;
    const isAdmin = user?.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to full project details');
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto, user: User): Promise<Project> {
    const project = await this.findOne(id, user);

    // Only owner or admin can update
    const isOwner = project.entrepreneurId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only update your own projects');
    }

    // Entrepreneurs can only update DRAFT or UNDER_REVIEW projects
    if (isOwner && !isAdmin && ![ProjectStatus.DRAFT, ProjectStatus.UNDER_REVIEW].includes(project.status)) {
      throw new BadRequestException('Cannot update a project that is already active or funded');
    }

    // If title changed, regenerate slug
    if (dto.title && dto.title !== project.title) {
      const newSlug = this.generateSlug(dto.title);
      const existing = await this.projectRepo.findOne({
        where: { slug: newSlug },
        withDeleted: true,
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('A project with a similar title already exists');
      }
      (dto as any).slug = newSlug;
    }

    Object.assign(project, dto);
    return this.projectRepo.save(project);
  }

  async remove(id: string, user: User): Promise<void> {
    const project = await this.findOne(id, user);

    const isOwner = project.entrepreneurId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only delete your own projects');
    }

    await this.projectRepo.softDelete(id);
    this.logger.log(`Project soft-deleted: ${id}`);
  }

  async submitForReview(id: string, user: User): Promise<Project> {
    const project = await this.findOne(id, user);

    if (project.entrepreneurId !== user.id) {
      throw new ForbiddenException('You can only submit your own projects');
    }

    if (project.status !== ProjectStatus.DRAFT) {
      throw new BadRequestException('Only draft projects can be submitted for review');
    }

    project.status = ProjectStatus.UNDER_REVIEW;
    return this.projectRepo.save(project);
  }

  async approve(id: string, user: User): Promise<Project> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can approve projects');
    }

    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    if (![ProjectStatus.UNDER_REVIEW, ProjectStatus.DRAFT].includes(project.status)) {
      throw new BadRequestException('Project is not in review status');
    }

    project.status = ProjectStatus.ACTIVE;
    return this.projectRepo.save(project);
  }

  async reject(id: string, user: User): Promise<Project> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can reject projects');
    }

    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    if (![ProjectStatus.UNDER_REVIEW, ProjectStatus.DRAFT].includes(project.status)) {
      throw new BadRequestException('Project is not in review status');
    }

    project.status = ProjectStatus.CANCELLED;
    return this.projectRepo.save(project);
  }

  async toggleFeatured(id: string, user: User): Promise<Project> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can feature projects');
    }

    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    project.featured = !project.featured;
    if (project.featured && !project.featuredOrder) {
      // Get max featured order
      const maxOrder = await this.projectRepo
        .createQueryBuilder('p')
        .select('MAX(p.featuredOrder)', 'max')
        .where('p.featured = true')
        .getRawOne();
      project.featuredOrder = (maxOrder?.max || 0) + 1;
    }

    return this.projectRepo.save(project);
  }

  async getStats(): Promise<any> {
    const total = await this.projectRepo.count();
    const byStatus = await this.projectRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.status')
      .getRawMany();

    const bySector = await this.projectRepo
      .createQueryBuilder('p')
      .select('p.sector', 'sector')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.sector')
      .getRawMany();

    const totalFundingGoal = await this.projectRepo
      .createQueryBuilder('p')
      .select('SUM(p.fundingGoal)', 'total')
      .getRawOne();

    const totalFundingRaised = await this.projectRepo
      .createQueryBuilder('p')
      .select('SUM(p.fundingRaised)', 'total')
      .getRawOne();

    return {
      total,
      byStatus,
      bySector,
      totalFundingGoal: parseFloat(totalFundingGoal?.total || '0'),
      totalFundingRaised: parseFloat(totalFundingRaised?.total || '0'),
    };
  }

  // ───────────────────────────────────────────────
  // Milestones
  // ───────────────────────────────────────────────

  async findMilestones(projectId: string, user: User): Promise<Milestone[]> {
    await this.findOne(projectId, user); // validates access
    return this.milestoneRepo.find({ where: { projectId }, order: { order: 'ASC' } });
  }

  async createMilestone(projectId: string, dto: CreateMilestoneDto, user: User): Promise<Milestone> {
    const project = await this.findOne(projectId, user);

    const isOwner = project.entrepreneurId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only add milestones to your own projects');
    }

    const milestone = this.milestoneRepo.create({
      ...dto,
      projectId,
    });

    return this.milestoneRepo.save(milestone);
  }

  async updateMilestone(milestoneId: string, dto: UpdateMilestoneDto, user: User): Promise<Milestone> {
    const milestone = await this.milestoneRepo.findOne({
      where: { id: milestoneId },
      relations: ['project'],
    });

    if (!milestone) throw new NotFoundException('Milestone not found');

    const isOwner = milestone.project.entrepreneurId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only update milestones for your own projects');
    }

    Object.assign(milestone, dto);
    return this.milestoneRepo.save(milestone);
  }

  async completeMilestone(milestoneId: string, user: User): Promise<Milestone> {
    const milestone = await this.milestoneRepo.findOne({
      where: { id: milestoneId },
      relations: ['project'],
    });

    if (!milestone) throw new NotFoundException('Milestone not found');

    const isOwner = milestone.project.entrepreneurId === user.id;
    const isAssessor = user.role === UserRole.ASSESSOR;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAssessor && !isAdmin) {
      throw new ForbiddenException('You are not authorized to complete this milestone');
    }

    milestone.status = MilestoneStatus.COMPLETED;
    milestone.completedAt = new Date();
    milestone.verifiedBy = user.id;

    return this.milestoneRepo.save(milestone);
  }

  // ───────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36);
  }
}
