import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { randomUUID } from "crypto";
import {
  GreenSector,
  MediaPurpose,
  MediaStatus,
  MilestoneStatus,
  PlatformRole,
  Prisma,
  ProjectStage,
  ProjectStatus,
} from "@prisma/client";
import {
  AuthenticatedUser,
  CurrentUser,
  getLimit,
  getPage,
  PaginatedResponse,
  PaginationDto,
  Public,
  Roles,
  toPaginationMeta,
} from "@evzone/common";
import { PrismaService, TransactionService } from "@evzone/database";
import { OutboxService } from "@evzone/events";
import { PermissionsService } from "@evzone/permissions";
import { StorageService, SignedUploadIntent } from "@evzone/storage";

interface ProjectResponse {
  id: string;
  tenantId: string;
  entrepreneurId: string;
  ownerUserId: string;
  title: string;
  slug: string;
  subtitle: string | null;
  summary: string;
  description: string | null;
  longDescription: string | null;
  coverImage: string | null;
  galleryImages: string[];
  videoUrl: string | null;
  impactVideo: string | null;
  story: Prisma.JsonValue | null;
  status: ProjectStatus;
  fundingGoal: string;
  fundingTarget: string;
  fundingRaised: string;
  minInvestment: string;
  maxInvestment: string | null;
  currency: string;
  equityOffered: string | null;
  country: string;
  countryCode: string;
  city: string | null;
  region: string | null;
  coordinates: string | null;
  locationDescription: string | null;
  sector: GreenSector;
  stage: ProjectStage;
  impactMetrics: Prisma.JsonValue | null;
  expectedImpact: Prisma.JsonValue | null;
  sdgs: number[];
  teamMembers: Prisma.JsonValue | null;
  risks: Prisma.JsonValue | null;
  faqs: Prisma.JsonValue | null;
  riskRating: string | null;
  viewCount: number;
  featured: boolean;
  featuredOrder: number | null;
  dueDiligenceStatus: string;
  dueDiligenceScore: number | null;
  assessorAssignedId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

class ProjectFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsEnum(GreenSector)
  sector?: GreenSector;

  @IsOptional()
  @IsEnum(ProjectStage)
  stage?: ProjectStage;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  entrepreneurId?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => value === "true")
  featured?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: string }) => value === "true")
  mine?: boolean;
}

class CreateProjectDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  longDescription?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  impactVideo?: string;

  @IsOptional()
  story?: Prisma.InputJsonValue;

  @IsOptional()
  @IsNumber()
  fundingTarget?: number;

  @IsOptional()
  @IsNumber()
  fundingGoal?: number;

  @IsOptional()
  @IsNumber()
  minInvestment?: number;

  @IsOptional()
  @IsNumber()
  maxInvestment?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsString()
  country!: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  coordinates?: string;

  @IsOptional()
  @IsString()
  locationDescription?: string;

  @IsEnum(GreenSector)
  sector!: GreenSector;

  @IsEnum(ProjectStage)
  stage!: ProjectStage;

  @IsOptional()
  impactMetrics?: Prisma.InputJsonValue;

  @IsOptional()
  expectedImpact?: Prisma.InputJsonValue;

  @IsOptional()
  @IsArray()
  sdgs?: number[];

  @IsOptional()
  teamMembers?: Prisma.InputJsonValue;

  @IsOptional()
  risks?: Prisma.InputJsonValue;

  @IsOptional()
  faqs?: Prisma.InputJsonValue;
}

class UpdateProjectDto extends CreateProjectDto {
  @IsOptional()
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  country!: string;

  @IsOptional()
  @IsEnum(GreenSector)
  sector!: GreenSector;

  @IsOptional()
  @IsEnum(ProjectStage)
  stage!: ProjectStage;
}

class CreateMilestoneDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  deliverables?: Prisma.InputJsonValue;
}

class UpdateMilestoneDto extends CreateMilestoneDto {
  @IsOptional()
  @IsEnum(MilestoneStatus)
  status?: MilestoneStatus;
}

class CreateUploadIntentDto {
  @IsString()
  fileName!: string;

  @IsString()
  contentType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsEnum(MediaPurpose)
  purpose?: MediaPurpose;
}

class UpdateMediaDto {
  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MediaStatus)
  status?: MediaStatus;
}

class ReorderGalleryDto {
  @IsArray()
  mediaIds!: string[];
}

class RequestRevisionDto {
  @IsString()
  notes!: string;
}

interface MediaUploadIntentResponse extends SignedUploadIntent {
  mediaAssetId: string;
  status: MediaStatus;
}

@Injectable()
class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly outbox: OutboxService,
    private readonly permissions: PermissionsService,
    private readonly storage: StorageService,
  ) {}

  async create(
    owner: AuthenticatedUser,
    dto: CreateProjectDto,
  ): Promise<ProjectResponse> {
    const fundingTarget = dto.fundingTarget ?? dto.fundingGoal;
    if (!fundingTarget)
      throw new BadRequestException("fundingTarget or fundingGoal is required");
    const slug = this.generateSlug(dto.title);
    const project = await this.transactions.run(async (tx) => {
      const created = await tx.project.create({
        data: {
          tenantId: owner.tenantId,
          ownerUserId: owner.id,
          title: dto.title,
          slug,
          subtitle: dto.subtitle,
          summary: dto.summary ?? dto.description.slice(0, 240),
          description: dto.description,
          longDescription: dto.longDescription,
          coverImage: dto.coverImage,
          videoUrl: dto.videoUrl,
          impactVideo: dto.impactVideo,
          story: dto.story,
          country: dto.country,
          countryCode: dto.countryCode ?? dto.country.slice(0, 2).toUpperCase(),
          city: dto.city,
          region: dto.region,
          coordinates: dto.coordinates,
          locationDescription: dto.locationDescription,
          sector: dto.sector,
          stage: dto.stage,
          fundingTarget,
          minInvestment: dto.minInvestment,
          maxInvestment: dto.maxInvestment,
          currency: dto.currency ?? "USD",
          impactMetrics: dto.impactMetrics,
          expectedImpact: dto.expectedImpact,
          sdgs: dto.sdgs ?? [],
          teamMembers: dto.teamMembers,
          risks: dto.risks,
          faqs: dto.faqs,
        },
        include: { gallery: true, dueDiligence: true },
      });
      await this.outbox.create(tx, {
        tenantId: owner.tenantId,
        topic: "project.created",
        eventType: "project.created",
        aggregateType: "project",
        aggregateId: created.id,
        payload: { projectId: created.id, ownerUserId: owner.id },
      });
      return created;
    });
    return this.toResponse(project);
  }

  async findAll(
    filter: ProjectFilterDto,
    user?: AuthenticatedUser,
  ): Promise<PaginatedResponse<ProjectResponse>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where = this.buildProjectWhere(filter, false, user);
    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: { gallery: true, dueDiligence: true },
        orderBy: this.projectOrderBy(filter.sortBy, filter.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);
    return {
      data: data.map((project) => this.toResponse(project)),
      meta: toPaginationMeta(page, limit, total),
    };
  }

  async findFeatured(): Promise<ProjectResponse[]> {
    const projects = await this.prisma.project.findMany({
      where: { featured: true, status: ProjectStatus.ACTIVE, deletedAt: null },
      include: { gallery: true, dueDiligence: true },
      orderBy: [{ featuredOrder: "asc" }, { createdAt: "desc" }],
      take: 6,
    });
    return projects.map((project) => this.toResponse(project));
  }

  async findOne(id: string): Promise<ProjectResponse> {
    const project = await this.prisma.project.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      include: { gallery: true, dueDiligence: true },
    });
    if (!this.publicStatuses().includes(project.status))
      throw new NotFoundException("Project not found");
    return this.toResponse(project);
  }

  async findOneFull(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    const project = await this.getProjectForAccess(id, user);
    return this.toResponse(project);
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    const project = await this.getProjectForAccess(id, user);
    this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);
    const ownerEditableStatuses: ProjectStatus[] = [
      ProjectStatus.DRAFT,
      ProjectStatus.UNDER_REVIEW,
      ProjectStatus.SUBMITTED,
    ];
    if (
      !this.permissions.isPlatformAdmin(user) &&
      !ownerEditableStatuses.includes(project.status)
    ) {
      throw new BadRequestException(
        "Cannot update a project after it is active",
      );
    }
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        summary: dto.summary,
        description: dto.description,
        longDescription: dto.longDescription,
        coverImage: dto.coverImage,
        videoUrl: dto.videoUrl,
        impactVideo: dto.impactVideo,
        story: dto.story,
        country: dto.country,
        countryCode: dto.countryCode,
        city: dto.city,
        region: dto.region,
        coordinates: dto.coordinates,
        locationDescription: dto.locationDescription,
        sector: dto.sector,
        stage: dto.stage,
        fundingTarget: dto.fundingTarget ?? dto.fundingGoal,
        minInvestment: dto.minInvestment,
        maxInvestment: dto.maxInvestment,
        currency: dto.currency,
        impactMetrics: dto.impactMetrics,
        expectedImpact: dto.expectedImpact,
        sdgs: dto.sdgs,
        teamMembers: dto.teamMembers,
        risks: dto.risks,
        faqs: dto.faqs,
      },
      include: { gallery: true, dueDiligence: true },
    });
    return this.toResponse(updated);
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const project = await this.getProjectForAccess(id, user);
    this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);
    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async submitForReview(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    const project = await this.getProjectForAccess(id, user);
    if (project.ownerUserId !== user.id)
      throw new ForbiddenException("You can only submit your own projects");
    if (project.status !== ProjectStatus.DRAFT)
      throw new BadRequestException("Only draft projects can be submitted");
    const updated = await this.transitionProject(
      id,
      ProjectStatus.UNDER_REVIEW,
      user.tenantId,
      "project.submitted",
    );
    return this.toResponse(updated);
  }

  async approve(id: string, user: AuthenticatedUser): Promise<ProjectResponse> {
    const updated = await this.transitionProject(
      id,
      ProjectStatus.ACTIVE,
      user.tenantId,
      "project.approved",
    );
    return this.toResponse(updated);
  }

  async reject(id: string, user: AuthenticatedUser): Promise<ProjectResponse> {
    const updated = await this.transitionProject(
      id,
      ProjectStatus.REJECTED,
      user.tenantId,
      "project.rejected",
    );
    return this.toResponse(updated);
  }

  async requestRevision(
    id: string,
    dto: RequestRevisionDto,
    user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { gallery: true, dueDiligence: true },
    });
    if (!project || project.deletedAt)
      throw new NotFoundException("Project not found");
    if (project.status !== ProjectStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        "Can only request revision for projects under review",
      );
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.project.update({
        where: { id },
        data: {
          status: ProjectStatus.DRAFT,
          revisionNotes: dto.notes,
          revisionRequestedAt: new Date(),
        },
        include: { gallery: true, dueDiligence: true },
      });
      await this.outbox.create(tx, {
        tenantId: user.tenantId,
        topic: "project.revision-requested",
        eventType: "project.revision-requested",
        aggregateType: "project",
        aggregateId: id,
        payload: { projectId: id, notes: dto.notes },
      });
      return result;
    });
    return this.toResponse(updated);
  }

  async toggleFeatured(id: string): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException("Project not found");
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        featured: !project.featured,
        featuredOrder: project.featured ? null : (project.featuredOrder ?? 1),
      },
      include: { gallery: true, dueDiligence: true },
    });
    return this.toResponse(updated);
  }

  async getStats(user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const where = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
    const [total, byStatus, bySector, funding] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.groupBy({
        by: ["status"],
        where,
        _count: { status: true },
      }),
      this.prisma.project.groupBy({
        by: ["sector"],
        where,
        _count: { sector: true },
      }),
      this.prisma.project.aggregate({
        where,
        _sum: { fundingTarget: true, fundingRaised: true },
      }),
    ]);
    return {
      total,
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count.status,
      })),
      bySector: bySector.map((row) => ({
        sector: row.sector,
        count: row._count.sector,
      })),
      totalFundingGoal: funding._sum.fundingTarget?.toString() ?? "0",
      totalFundingRaised: funding._sum.fundingRaised?.toString() ?? "0",
    };
  }

  async findMilestones(
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<unknown[]> {
    await this.getProjectForAccess(projectId, user);
    return this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    });
  }

  async createMilestone(
    projectId: string,
    dto: CreateMilestoneDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const project = await this.getProjectForAccess(projectId, user);
    this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);
    return this.prisma.milestone.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        amount: dto.amount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        order: dto.order ?? 0,
        deliverables: dto.deliverables,
      },
    });
  }

  async updateMilestone(
    id: string,
    dto: UpdateMilestoneDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!milestone) throw new NotFoundException("Milestone not found");
    this.permissions.assertOwnerOrAdmin(user, milestone.project.ownerUserId);
    return this.prisma.milestone.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        amount: dto.amount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        order: dto.order,
        deliverables: dto.deliverables,
        status: dto.status,
      },
    });
  }

  async completeMilestone(
    id: string,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!milestone) throw new NotFoundException("Milestone not found");
    const milestoneCompletionRoles: PlatformRole[] = [
      PlatformRole.ADMIN,
      PlatformRole.SUPER_ADMIN,
      PlatformRole.ASSESSOR,
    ];
    if (
      !milestoneCompletionRoles.includes(user.role) &&
      milestone.project.ownerUserId !== user.id
    ) {
      throw new ForbiddenException(
        "You are not authorized to complete this milestone",
      );
    }
    return this.prisma.milestone.update({
      where: { id },
      data: {
        status: MilestoneStatus.COMPLETED,
        completedAt: new Date(),
        verifiedBy: user.id,
      },
    });
  }

  async createGalleryUploadIntent(
    projectId: string,
    dto: CreateUploadIntentDto,
    user: AuthenticatedUser,
  ): Promise<MediaUploadIntentResponse> {
    const project = await this.getProjectForAccess(projectId, user);
    this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);
    const mediaAssetId = cryptoRandomId();
    const objectKey = this.storage.buildObjectKey(
      [
        "tenants",
        project.tenantId,
        "projects",
        project.id,
        "gallery",
        mediaAssetId,
      ],
      dto.fileName,
    );
    const intent = await this.storage.createUploadIntent(
      objectKey,
      dto.contentType,
    );
    await this.prisma.mediaAsset.create({
      data: {
        id: mediaAssetId,
        tenantId: project.tenantId,
        projectId,
        ownerUserId: user.id,
        bucket: intent.bucket,
        objectKey: intent.objectKey,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        status: MediaStatus.PENDING_UPLOAD,
        purpose: dto.purpose ?? MediaPurpose.PROJECT_GALLERY,
        altText: dto.altText,
      },
    });
    return { ...intent, mediaAssetId, status: MediaStatus.PENDING_UPLOAD };
  }

  async findGallery(projectId: string): Promise<unknown[]> {
    await this.findOne(projectId);
    return this.prisma.mediaAsset.findMany({
      where: { projectId, status: { not: MediaStatus.DELETED } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async updateMedia(
    projectId: string,
    mediaId: string,
    dto: UpdateMediaDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const project = await this.getProjectForAccess(projectId, user);
    this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);
    return this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        altText: dto.altText,
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
    });
  }

  async deleteMedia(
    projectId: string,
    mediaId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const project = await this.getProjectForAccess(projectId, user);
    this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);
    await this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: { status: MediaStatus.DELETED },
    });
  }

  async reorderGallery(
    projectId: string,
    dto: ReorderGalleryDto,
    user: AuthenticatedUser,
  ): Promise<unknown[]> {
    const project = await this.getProjectForAccess(projectId, user);
    this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);
    await this.prisma.$transaction(
      dto.mediaIds.map((mediaId, index) =>
        this.prisma.mediaAsset.update({
          where: { id: mediaId },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.findGallery(projectId);
  }

  private async transitionProject(
    id: string,
    status: ProjectStatus,
    tenantId: string,
    eventType: string,
  ): Promise<
    Prisma.ProjectGetPayload<{ include: { gallery: true; dueDiligence: true } }>
  > {
    return this.transactions.run(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: { status },
        include: { gallery: true, dueDiligence: true },
      });
      await this.outbox.create(tx, {
        tenantId,
        topic: eventType,
        eventType,
        aggregateType: "project",
        aggregateId: id,
        payload: { projectId: id, status },
      });
      return updated;
    });
  }

  private async getProjectForAccess(
    id: string,
    user: AuthenticatedUser,
  ): Promise<
    Prisma.ProjectGetPayload<{ include: { gallery: true; dueDiligence: true } }>
  > {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { gallery: true, dueDiligence: true },
    });
    if (!project || project.deletedAt)
      throw new NotFoundException("Project not found");
    this.permissions.assertTenantAccess(user, project.tenantId);
    return project;
  }

  private buildProjectWhere(
    filter: ProjectFilterDto,
    includePrivate: boolean,
    user?: AuthenticatedUser,
  ): Prisma.ProjectWhereInput {
    const and: Prisma.ProjectWhereInput[] = [{ deletedAt: null }];
    if (!includePrivate) and.push({ status: { in: this.publicStatuses() } });
    if (filter.status) and.push({ status: filter.status });
    if (filter.sector) and.push({ sector: filter.sector });
    if (filter.stage) and.push({ stage: filter.stage });
    if (filter.country)
      and.push({ country: { contains: filter.country, mode: "insensitive" } });
    if (filter.entrepreneurId) and.push({ ownerUserId: filter.entrepreneurId });
    if (filter.featured) and.push({ featured: true });
    if (filter.mine && user) and.push({ ownerUserId: user.id });
    if (filter.search) {
      and.push({
        OR: [
          { title: { contains: filter.search, mode: "insensitive" } },
          { summary: { contains: filter.search, mode: "insensitive" } },
          { description: { contains: filter.search, mode: "insensitive" } },
        ],
      });
    }
    return { AND: and };
  }

  private projectOrderBy(
    sortBy: string | undefined,
    sortOrder: "asc" | "desc" = "desc",
  ): Prisma.ProjectOrderByWithRelationInput {
    if (sortBy === "title") return { title: sortOrder };
    if (sortBy === "fundingRaised") return { fundingRaised: sortOrder };
    if (sortBy === "featuredOrder") return { featuredOrder: sortOrder };
    if (sortBy === "updatedAt") return { updatedAt: sortOrder };
    return { createdAt: sortOrder };
  }

  private publicStatuses(): ProjectStatus[] {
    return [
      ProjectStatus.ACTIVE,
      ProjectStatus.LISTED,
      ProjectStatus.FUNDING,
      ProjectStatus.FUNDED,
      ProjectStatus.COMPLETED,
    ];
  }

  private toResponse(
    project: Prisma.ProjectGetPayload<{
      include: { gallery: true; dueDiligence: true };
    }>,
  ): ProjectResponse {
    const readyGallery = project.gallery
      .filter(
        (asset) =>
          asset.status === MediaStatus.READY ||
          asset.status === MediaStatus.UPLOADED,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((asset) => asset.publicUrl ?? asset.objectKey);
    return {
      id: project.id,
      tenantId: project.tenantId,
      entrepreneurId: project.ownerUserId,
      ownerUserId: project.ownerUserId,
      title: project.title,
      slug: project.slug,
      subtitle: project.subtitle,
      summary: project.summary,
      description: project.description,
      longDescription: project.longDescription,
      coverImage: project.coverImage,
      galleryImages: readyGallery,
      videoUrl: project.videoUrl,
      impactVideo: project.impactVideo,
      story: project.story,
      status: project.status,
      fundingGoal: project.fundingTarget.toString(),
      fundingTarget: project.fundingTarget.toString(),
      fundingRaised: project.fundingRaised.toString(),
      minInvestment: project.minInvestment.toString(),
      maxInvestment: project.maxInvestment?.toString() ?? null,
      currency: project.currency,
      equityOffered: project.equityOffered?.toString() ?? null,
      country: project.country,
      countryCode: project.countryCode,
      city: project.city,
      region: project.region,
      coordinates: project.coordinates,
      locationDescription: project.locationDescription,
      sector: project.sector,
      stage: project.stage,
      impactMetrics: project.impactMetrics,
      expectedImpact: project.expectedImpact,
      sdgs: project.sdgs,
      teamMembers: project.teamMembers,
      risks: project.risks,
      faqs: project.faqs,
      riskRating: project.riskRating,
      viewCount: project.viewCount,
      featured: project.featured,
      featuredOrder: project.featuredOrder,
      dueDiligenceStatus: project.dueDiligence?.status ?? "NOT_STARTED",
      dueDiligenceScore: project.dueDiligence?.riskScore ?? null,
      assessorAssignedId: project.dueDiligence?.assignedAssessorId ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private generateSlug(title: string): string {
    return `${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
  }
}

function cryptoRandomId(): string {
  return randomUUID();
}

@ApiTags("Projects")
@ApiBearerAuth()
@Controller("projects")
class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Public()
  @Get()
  findAll(
    @Query() filter: ProjectFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<ProjectResponse>> {
    return this.projectsService.findAll(filter, user);
  }

  @Public()
  @Get("featured")
  findFeatured(): Promise<ProjectResponse[]> {
    return this.projectsService.findFeatured();
  }

  @Get("stats/overview")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  getStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.projectsService.getStats(user);
  }

  @Post()
  @Roles(
    PlatformRole.ENTREPRENEUR,
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projectsService.create(user, dto);
  }

  @Public()
  @Get(":id")
  findOne(@Param("id") id: string): Promise<ProjectResponse> {
    return this.projectsService.findOne(id);
  }

  @Get(":id/full")
  findOneFull(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    return this.projectsService.findOneFull(id, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    return this.projectsService.update(id, dto, user);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.projectsService.remove(id, user);
  }

  @Post(":id/submit")
  @Roles(PlatformRole.ENTREPRENEUR)
  submitForReview(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    return this.projectsService.submitForReview(id, user);
  }

  @Post(":id/approve")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  approve(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    return this.projectsService.approve(id, user);
  }

  @Post(":id/reject")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  reject(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    return this.projectsService.reject(id, user);
  }

  @Post(":id/request-revision")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  requestRevision(
    @Param("id") id: string,
    @Body() dto: RequestRevisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    return this.projectsService.requestRevision(id, dto, user);
  }

  @Post(":id/feature")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  toggleFeatured(@Param("id") id: string): Promise<ProjectResponse> {
    return this.projectsService.toggleFeatured(id);
  }

  @Get(":id/milestones")
  findMilestones(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.projectsService.findMilestones(id, user);
  }

  @Post(":id/milestones")
  createMilestone(
    @Param("id") id: string,
    @Body() dto: CreateMilestoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.projectsService.createMilestone(id, dto, user);
  }

  @Post(":id/gallery/upload-intents")
  createGalleryUploadIntent(
    @Param("id") id: string,
    @Body() dto: CreateUploadIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaUploadIntentResponse> {
    return this.projectsService.createGalleryUploadIntent(id, dto, user);
  }

  @Public()
  @Get(":id/gallery")
  findGallery(@Param("id") id: string): Promise<unknown[]> {
    return this.projectsService.findGallery(id);
  }

  @Patch(":projectId/gallery/:mediaId")
  updateMedia(
    @Param("projectId") projectId: string,
    @Param("mediaId") mediaId: string,
    @Body() dto: UpdateMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.projectsService.updateMedia(projectId, mediaId, dto, user);
  }

  @Delete(":projectId/gallery/:mediaId")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMedia(
    @Param("projectId") projectId: string,
    @Param("mediaId") mediaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.projectsService.deleteMedia(projectId, mediaId, user);
  }

  @Post(":id/gallery/reorder")
  reorderGallery(
    @Param("id") id: string,
    @Body() dto: ReorderGalleryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.projectsService.reorderGallery(id, dto, user);
  }
}

@ApiTags("Milestones")
@ApiBearerAuth()
@Controller("milestones")
class MilestonesController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateMilestoneDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.projectsService.updateMilestone(id, dto, user);
  }

  @Post(":id/complete")
  complete(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.projectsService.completeMilestone(id, user);
  }
}

@Module({
  controllers: [ProjectsController, MilestonesController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
