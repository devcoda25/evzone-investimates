import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import {
  buildPaginationMeta,
  getSortField,
  getSortOrder,
  normalizePrisma,
  withFundingProgress,
} from '@database/prisma.helpers';
import {
  CreateProjectDto,
  UpdateProjectDto,
  ProjectFilterDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto';
import { ProjectStatus, UserRole, MilestoneStatus } from '@common/enums';
import { PaginatedResponse } from '@common/dto/pagination.dto';
import { User } from '@modules/users/entities/user.entity';

const PROJECT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'fundingGoal',
  'fundingRaised',
  'campaignEndDate',
  'viewCount',
  'featuredOrder',
  'status',
  'country',
  'city',
] as const;

const MILESTONE_SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'order', 'title'] as const;

const projectListInclude = {
  milestones: true,
} satisfies Prisma.ProjectInclude;

const projectFullInclude = {
  milestones: true,
  entrepreneur: {
    include: {
      investorProfile: true,
      entrepreneurProfile: true,
      assessorProfile: true,
    },
  },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(entrepreneurId: string, dto: CreateProjectDto): Promise<any> {
    const slug = this.generateSlug(dto.title);

    const existing = await this.prisma.project.findFirst({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException('A project with a similar title already exists');
    }

    const project = await this.prisma.project.create({
      data: {
        entrepreneurId,
        slug,
        title: dto.title,
        subtitle: dto.subtitle,
        description: dto.description,
        longDescription: dto.longDescription,
        coverImage: dto.coverImage,
        galleryImages: dto.galleryImages || [],
        videoUrl: dto.videoUrl,
        status: ProjectStatus.DRAFT as any,
        fundingGoal: dto.fundingGoal,
        fundingRaised: 0,
        minInvestment: dto.minInvestment ?? 100,
        maxInvestment: dto.maxInvestment,
        currency: dto.currency || 'USD',
        equityOffered: dto.equityOffered,
        country: dto.country,
        city: dto.city,
        region: dto.region,
        sector: dto.sector as any,
        stage: dto.stage as any,
        impactMetrics: dto.impactMetrics as Prisma.InputJsonValue | undefined,
        sdgs: dto.sdgs || [],
        campaignStartDate: dto.campaignStartDate ? new Date(dto.campaignStartDate) : undefined,
        campaignEndDate: dto.campaignEndDate ? new Date(dto.campaignEndDate) : undefined,
        projectStartDate: dto.projectStartDate ? new Date(dto.projectStartDate) : undefined,
        projectEndDate: dto.projectEndDate ? new Date(dto.projectEndDate) : undefined,
        teamMembers: dto.teamMembers as Prisma.InputJsonValue | undefined,
        risks: dto.risks as Prisma.InputJsonValue | undefined,
        faqs: dto.faqs as Prisma.InputJsonValue | undefined,
      },
      include: projectListInclude,
    });

    this.logger.log(`Project created: ${project.title} by ${entrepreneurId}`);

    return withFundingProgress(project as any);
  }

  async findAll(filter: ProjectFilterDto, user?: User): Promise<PaginatedResponse<any>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = getSortField(filter.sortBy, PROJECT_SORT_FIELDS, 'createdAt');
    const sortOrder = getSortOrder(filter.sortOrder);
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
    };

    const isAdmin = user?.role === UserRole.ADMIN;
    const publicStatuses = [ProjectStatus.ACTIVE, ProjectStatus.FUNDED, ProjectStatus.COMPLETED];
    if (!isAdmin) {
      if (filter.status) {
        if (!publicStatuses.includes(filter.status)) {
          return {
            data: [],
            meta: buildPaginationMeta(page, limit, 0),
          };
        }
        where.status = filter.status as any;
      } else {
        where.status = { in: publicStatuses as any };
      }
    } else if (filter.status) {
      where.status = filter.status as any;
    }
    if (filter.sector) {
      where.sector = filter.sector as any;
    }
    if (filter.stage) {
      where.stage = filter.stage as any;
    }
    if (filter.country) {
      where.country = { contains: filter.country, mode: 'insensitive' };
    }
    if (filter.entrepreneurId) {
      where.entrepreneurId = filter.entrepreneurId;
    }
    if (filter.mine && user) {
      where.entrepreneurId = user.id;
    }
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { country: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.ProjectOrderByWithRelationInput[] = [];
    if (filter.featured) {
      orderBy.push({ featured: 'desc' }, { featuredOrder: 'asc' });
    }
    orderBy.push({ [sortBy]: sortOrder });

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: projectListInclude,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: projects.map((project) => withFundingProgress(project as any)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async findFeatured(): Promise<any[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        featured: true,
        status: ProjectStatus.ACTIVE as any,
        deletedAt: null,
      },
      include: projectListInclude,
      orderBy: [{ featuredOrder: 'asc' }, { createdAt: 'desc' }],
      take: 6,
    });

    return projects.map((project) => withFundingProgress(project as any));
  }

  async findOne(id: string, user?: User): Promise<any> {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: projectListInclude,
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isOwner = !!user && project.entrepreneurId === user.id;
    const isAdmin = user?.role === UserRole.ADMIN;
    const isPublic = [ProjectStatus.ACTIVE, ProjectStatus.FUNDED, ProjectStatus.COMPLETED].includes(
      project.status as any,
    );

    if (!isPublic && !isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to this project');
    }

    if (!isOwner) {
      await this.prisma.project.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });
      project.viewCount += 1;
    }

    return withFundingProgress(project as any);
  }

  async findOneFull(id: string, user?: User): Promise<any> {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: projectFullInclude,
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isOwner = !!user && project.entrepreneurId === user.id;
    const isAdmin = user?.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to full project details');
    }

    return withFundingProgress(project as any);
  }

  async update(id: string, dto: UpdateProjectDto, user: User): Promise<any> {
    const project = await this.findOne(id, user);

    const isOwner = project.entrepreneurId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only update your own projects');
    }

    if (isOwner && !isAdmin && ![ProjectStatus.DRAFT, ProjectStatus.UNDER_REVIEW].includes(project.status)) {
      throw new BadRequestException('Cannot update a project that is already active or funded');
    }

    let slug = project.slug;
    if (dto.title && dto.title !== project.title) {
      slug = this.generateSlug(dto.title);
      const existing = await this.prisma.project.findFirst({
        where: {
          slug,
          NOT: { id },
        },
      });
      if (existing) {
        throw new ConflictException('A project with a similar title already exists');
      }
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        slug,
        title: dto.title,
        subtitle: dto.subtitle,
        description: dto.description,
        longDescription: dto.longDescription,
        coverImage: dto.coverImage,
        galleryImages: dto.galleryImages,
        videoUrl: dto.videoUrl,
        fundingGoal: dto.fundingGoal,
        minInvestment: dto.minInvestment,
        maxInvestment: dto.maxInvestment,
        currency: dto.currency,
        equityOffered: dto.equityOffered,
        country: dto.country,
        city: dto.city,
        region: dto.region,
        sector: dto.sector as any,
        stage: dto.stage as any,
        impactMetrics: dto.impactMetrics as Prisma.InputJsonValue | undefined,
        sdgs: dto.sdgs,
        campaignStartDate: dto.campaignStartDate ? new Date(dto.campaignStartDate) : undefined,
        campaignEndDate: dto.campaignEndDate ? new Date(dto.campaignEndDate) : undefined,
        projectStartDate: dto.projectStartDate ? new Date(dto.projectStartDate) : undefined,
        projectEndDate: dto.projectEndDate ? new Date(dto.projectEndDate) : undefined,
        teamMembers: dto.teamMembers as Prisma.InputJsonValue | undefined,
        risks: dto.risks as Prisma.InputJsonValue | undefined,
        faqs: dto.faqs as Prisma.InputJsonValue | undefined,
      },
      include: projectListInclude,
    });

    return withFundingProgress(updated as any);
  }

  async remove(id: string, user: User): Promise<void> {
    const project = await this.findOne(id, user);

    const isOwner = project.entrepreneurId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only delete your own projects');
    }

    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Project soft-deleted: ${id}`);
  }

  async submitForReview(id: string, user: User): Promise<any> {
    const project = await this.findOne(id, user);

    if (project.entrepreneurId !== user.id) {
      throw new ForbiddenException('You can only submit your own projects');
    }

    if (project.status !== ProjectStatus.DRAFT) {
      throw new BadRequestException('Only draft projects can be submitted for review');
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.UNDER_REVIEW as any },
      include: projectListInclude,
    });

    return withFundingProgress(updated as any);
  }

  async approve(id: string, user: User): Promise<any> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can approve projects');
    }

    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (![ProjectStatus.UNDER_REVIEW, ProjectStatus.DRAFT].includes(project.status as any)) {
      throw new BadRequestException('Project is not in review status');
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.ACTIVE as any },
      include: projectListInclude,
    });

    return withFundingProgress(updated as any);
  }

  async reject(id: string, user: User): Promise<any> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can reject projects');
    }

    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (![ProjectStatus.UNDER_REVIEW, ProjectStatus.DRAFT].includes(project.status as any)) {
      throw new BadRequestException('Project is not in review status');
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.CANCELLED as any },
      include: projectListInclude,
    });

    return withFundingProgress(updated as any);
  }

  async toggleFeatured(id: string, user: User): Promise<any> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can feature projects');
    }

    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    let featuredOrder = project.featuredOrder;
    if (!project.featured) {
      const maxFeaturedOrder = await this.prisma.project.aggregate({
        where: { featured: true, deletedAt: null },
        _max: { featuredOrder: true },
      });
      featuredOrder = (maxFeaturedOrder._max.featuredOrder || 0) + 1;
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        featured: !project.featured,
        featuredOrder: project.featured ? null : featuredOrder,
      },
      include: projectListInclude,
    });

    return withFundingProgress(updated as any);
  }

  async getStats(): Promise<any> {
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null },
      select: {
        status: true,
        sector: true,
        fundingGoal: true,
        fundingRaised: true,
      },
    });

    const byStatusMap = new Map<string, number>();
    const bySectorMap = new Map<string, number>();
    let totalFundingGoal = 0;
    let totalFundingRaised = 0;

    for (const project of projects) {
      byStatusMap.set(project.status, (byStatusMap.get(project.status) || 0) + 1);
      bySectorMap.set(project.sector, (bySectorMap.get(project.sector) || 0) + 1);
      totalFundingGoal += Number(project.fundingGoal || 0);
      totalFundingRaised += Number(project.fundingRaised || 0);
    }

    return {
      total: projects.length,
      byStatus: Array.from(byStatusMap.entries()).map(([status, count]) => ({ status, count })),
      bySector: Array.from(bySectorMap.entries()).map(([sector, count]) => ({ sector, count })),
      totalFundingGoal,
      totalFundingRaised,
    };
  }

  async findMilestones(projectId: string, user: User): Promise<any[]> {
    await this.findOne(projectId, user);

    const milestones = await this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });

    return milestones.map((milestone) => normalizePrisma(milestone));
  }

  async createMilestone(projectId: string, dto: CreateMilestoneDto, user: User): Promise<any> {
    const project = await this.findOne(projectId, user);
    const isOwner = project.entrepreneurId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only add milestones to your own projects');
    }

    const milestone = await this.prisma.milestone.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        order: dto.order ?? 0,
        status: (dto.status || MilestoneStatus.PENDING) as any,
        deliverables: dto.deliverables as Prisma.InputJsonValue | undefined,
        fundingTranche: dto.fundingTranche,
        dueDate: new Date(dto.dueDate),
      },
    });

    return normalizePrisma(milestone);
  }

  async updateMilestone(milestoneId: string, dto: UpdateMilestoneDto, user: User): Promise<any> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { project: true },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    const isOwner = milestone.project.entrepreneurId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only update milestones for your own projects');
    }

    const updated = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        title: dto.title,
        description: dto.description,
        order: dto.order,
        status: dto.status as any,
        deliverables: dto.deliverables as Prisma.InputJsonValue | undefined,
        fundingTranche: dto.fundingTranche,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });

    return normalizePrisma(updated);
  }

  async completeMilestone(milestoneId: string, user: User): Promise<any> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { project: true },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    const isOwner = milestone.project.entrepreneurId === user.id;
    const isAssessor = user.role === UserRole.ASSESSOR;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isOwner && !isAssessor && !isAdmin) {
      throw new ForbiddenException('You are not authorized to complete this milestone');
    }

    const updated = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        status: MilestoneStatus.COMPLETED as any,
        completedAt: new Date(),
        verifiedBy: user.id,
      },
    });

    return normalizePrisma(updated);
  }

  private generateSlug(title: string): string {
    return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
  }
}
