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
  DocumentPurpose,
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
import { AuditService } from "@evzone/audit";
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

  @IsOptional()
  @IsNumber()
  valuation?: number;

  @IsOptional()
  @IsString()
  structure?: string;

  @IsOptional()
  @IsNumber()
  returnTarget?: number;

  @IsOptional()
  @IsNumber()
  equityOffered?: number;
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

export class CreateUploadIntentDto {
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

export class UpdateMediaDto {
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

export class ReorderGalleryDto {
  @IsArray()
  mediaIds!: string[];
}

export class CreateProjectDocumentDto {
  @IsString()
  fileName!: string;

  @IsString()
  contentType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;

  @IsOptional()
  @IsEnum(DocumentPurpose)
  purpose?: DocumentPurpose;
}

export interface ProjectDocumentResponse {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number | null;
  bucket: string;
  objectKey: string;
  purpose: DocumentPurpose;
  status: MediaStatus;
  createdAt: Date;
}

class RequestRevisionDto {
  @IsString()
  notes!: string;
}

export interface MediaUploadIntentResponse extends SignedUploadIntent {
  mediaAssetId: string;
  status: MediaStatus;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly outbox: OutboxService,
    private readonly permissions: PermissionsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
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
          valuation: dto.valuation,
          structure: dto.structure,
          returnTarget: dto.returnTarget,
          equityOffered: dto.equityOffered,
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
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user: owner },
        "project.created",
        "project",
        created.id,
        undefined,
        { title: created.title, status: created.status },
        undefined,
        tx as any,
      );
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
        valuation: dto.valuation,
        structure: dto.structure,
        returnTarget: dto.returnTarget,
        equityOffered: dto.equityOffered,
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
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.project.update({
        where: { id },
        data: { status: ProjectStatus.UNDER_REVIEW },
        include: { gallery: true, dueDiligence: true },
      });
      await this.outbox.create(tx, {
        tenantId: user.tenantId,
        topic: "project.submitted",
        eventType: "project.submitted",
        aggregateType: "project",
        aggregateId: id,
        payload: { projectId: id },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "project.submitted",
        "project",
        id,
        { status: project.status },
        { status: ProjectStatus.UNDER_REVIEW },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async approve(id: string, user: AuthenticatedUser): Promise<ProjectResponse> {
    const project = await this.getProjectForAccess(id, user);
    const updated = await this.transitionProject(
      id,
      ProjectStatus.ACTIVE,
      user.tenantId,
      "project.approved",
      user,
      project.status,
    );
    return this.toResponse(updated);
  }

  async reject(id: string, user: AuthenticatedUser): Promise<ProjectResponse> {
    const project = await this.getProjectForAccess(id, user);
    const updated = await this.transitionProject(
      id,
      ProjectStatus.REJECTED,
      user.tenantId,
      "project.rejected",
      user,
      project.status,
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

  async publish(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    const project = await this.getProjectForAccess(id, user);
    if (project.status !== ProjectStatus.ACTIVE) {
      throw new BadRequestException(
        "Only approved (ACTIVE) projects can be published",
      );
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.project.update({
        where: { id },
        data: { status: ProjectStatus.LISTED, listedAt: new Date() },
        include: { gallery: true, dueDiligence: true },
      });
      await this.outbox.create(tx, {
        tenantId: user.tenantId,
        topic: "project.published",
        eventType: "project.published",
        aggregateType: "project",
        aggregateId: id,
        payload: { projectId: id, status: ProjectStatus.LISTED },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "project.published",
        "project",
        id,
        { status: project.status },
        { status: ProjectStatus.LISTED },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async findDocuments(
    projectId: string,
    user: AuthenticatedUser,
  ): Promise<ProjectDocumentResponse[]> {
    await this.getProjectForAccess(projectId, user);
    const documents = await this.prisma.document.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return documents.map((document) => ({
      id: document.id,
      originalName: document.originalName,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      bucket: document.bucket,
      objectKey: document.objectKey,
      purpose: document.purpose,
      status: document.status,
      createdAt: document.createdAt,
    }));
  }

  async createDocument(
     projectId: string,
     dto: CreateProjectDocumentDto,
     user: AuthenticatedUser,
   ): Promise<{ documentId: string; bucket: string; objectKey: string; uploadUrl: string; expiresInSeconds: number; status: MediaStatus }> {
     const project = await this.getProjectForAccess(projectId, user);
     this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);
     const documentId = cryptoRandomId();
     const objectKey = this.storage.buildObjectKey(
       ["tenants", project.tenantId, "projects", project.id, "documents", documentId],
       dto.fileName,
     );
     const intent = await this.storage.createUploadIntent(
       objectKey,
       dto.contentType,
     );
     await this.prisma.document.create({
       data: {
         id: documentId,
         tenantId: project.tenantId,
         ownerUserId: user.id,
         projectId,
         originalName: dto.fileName,
         contentType: dto.contentType,
         sizeBytes: dto.sizeBytes,
         bucket: intent.bucket,
         objectKey: intent.objectKey,
         purpose: dto.purpose ?? DocumentPurpose.GENERAL,
         status: MediaStatus.PENDING_UPLOAD,
       },
     });
     return {
       documentId,
       bucket: intent.bucket,
       objectKey: intent.objectKey,
       uploadUrl: intent.uploadUrl,
       expiresInSeconds: intent.expiresInSeconds,
       status: MediaStatus.PENDING_UPLOAD,
     };
   }

   async getSignedUrl(projectId: string, mediaId: string, user: AuthenticatedUser): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    const project = await this.getProjectForAccess(projectId, user);
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId, projectId },
    });
    if (!media) throw new NotFoundException("Media asset not found");
    const signedUrl = await this.storage.createReadUrl(media.objectKey);
    return { signedUrl, expiresInSeconds: 900 };
  }

    async completeUpload(mediaId: string, user: AuthenticatedUser): Promise<unknown> {
      const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
      if (!media) throw new NotFoundException("Media asset not found");
      this.permissions.assertTenantAccess(user, media.tenantId);
      const updated = await this.transactions.run(async (tx) => {
        const result = await tx.mediaAsset.update({
          where: { id: mediaId },
          data: { status: MediaStatus.UPLOADED },
        });
        await this.outbox.create(tx, {
          tenantId: media.tenantId,
          topic: "media.upload.completed",
          eventType: "media.upload.completed",
          aggregateType: "media",
          aggregateId: mediaId,
          payload: { mediaAssetId: mediaId, projectId: media.projectId },
        });
        await this.audit.recordFromRequest(
          { ip: "", headers: {}, user },
          "media.upload.completed",
          "media",
          mediaId,
          undefined,
          { status: MediaStatus.UPLOADED },
          undefined,
          tx as any,
        );
        return result;
      });
      return updated;
    }

  async removeMilestone(id: string, user: AuthenticatedUser): Promise<void> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!milestone) throw new NotFoundException("Milestone not found");
    this.permissions.assertOwnerOrAdmin(user, milestone.project.ownerUserId);
    await this.prisma.milestone.delete({ where: { id } });
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
    user: AuthenticatedUser,
    oldStatus: ProjectStatus,
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
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        eventType,
        "project",
        id,
        { status: oldStatus },
        { status },
        undefined,
        tx as any,
      );
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

  // ============= Entrepreneur Dashboard =============

  async getEntrepreneurDashboard(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const tenantWhere = { tenantId: user.tenantId };
    const ownerWhere = { ownerUserId: user.id };

    const [
      totalProjects,
      projectsByStatus,
      totalFundingRaised,
      activeDeals,
      totalInvestors,
      pendingReviews,
      recentProjects,
      recentDeals,
    ] = await Promise.all([
      this.prisma.project.count({ where: { ...tenantWhere, ...ownerWhere, deletedAt: null } }),
      this.prisma.project.groupBy({
        by: ["status"],
        where: { ...tenantWhere, ...ownerWhere, deletedAt: null },
        _count: { status: true },
      }),
      this.prisma.project.aggregate({
        where: { ...tenantWhere, ...ownerWhere, deletedAt: null },
        _sum: { fundingRaised: true },
      }),
      this.prisma.deal.count({
        where: { ...tenantWhere, project: { ownerUserId: user.id } },
      }),
      this.prisma.investment.count({
        where: {
          project: { ownerUserId: user.id },
          status: { not: "CANCELLED" as any },
        },
      }),
      this.prisma.project.count({
        where: { ...tenantWhere, ...ownerWhere, status: ProjectStatus.UNDER_REVIEW },
      }),
      this.prisma.project.findMany({
        where: { ...tenantWhere, ...ownerWhere, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          fundingTarget: true,
          fundingRaised: true,
          currency: true,
          sector: true,
          createdAt: true,
        },
      }),
      this.prisma.deal.findMany({
        where: { ...tenantWhere, project: { ownerUserId: user.id } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          investments: { where: { status: { not: "CANCELLED" as any } }, select: { amount: true } },
        },
      }),
    ]);

    return {
      stats: {
        totalProjects,
        totalFundingRaised: totalFundingRaised._sum.fundingRaised?.toString() ?? "0",
        activeDeals,
        totalInvestors,
        pendingReviews,
      },
      projectsByStatus: Object.fromEntries(
        projectsByStatus.map((row) => [row.status, row._count.status]),
      ),
      recentProjects: recentProjects.map((p) => ({
        ...p,
        fundingTarget: p.fundingTarget.toString(),
        fundingRaised: p.fundingRaised.toString(),
      })),
      recentDeals: recentDeals.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        targetAmount: d.targetAmount?.toString() ?? "0",
        amountRaised: d.investments.reduce((sum, inv) => sum + inv.amount.toNumber(), 0).toString(),
        currency: d.currency,
        closesAt: d.closesAt,
      })),
    };
  }

  async getProjectAnalytics(
    id: string,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const project = await this.getProjectForAccess(id, user);
    this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);

    const [
      investments,
      investmentTrend,
      dealPerformance,
      milestones,
      documents,
    ] = await Promise.all([
      this.prisma.investment.aggregate({
        where: { projectId: id, status: { not: "CANCELLED" as any } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.investment.groupBy({
        by: ["status"],
        where: { projectId: id },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.deal.findMany({
        where: { projectId: id },
        include: {
          _count: { select: { investments: true } },
          investments: { where: { status: { not: "CANCELLED" as any } }, select: { amount: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      this.prisma.milestone.findMany({
        where: { projectId: id },
        orderBy: { order: "asc" },
      }),
      this.prisma.document.count({ where: { projectId: id } }),
    ]);

    return {
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        fundingTarget: project.fundingTarget.toString(),
        fundingRaised: project.fundingRaised.toString(),
        viewCount: project.viewCount,
      },
      investments: {
        totalCount: investments._count.id,
        totalAmount: investments._sum.amount?.toString() ?? "0",
        byStatus: Object.fromEntries(
          investmentTrend.map((row) => [
            row.status,
            { count: row._count.id, amount: row._sum.amount?.toString() ?? "0" },
          ]),
        ),
      },
      deals: dealPerformance.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        targetAmount: d.targetAmount?.toString() ?? "0",
        amountRaised: d.investments.reduce((sum, inv) => sum + inv.amount.toNumber(), 0).toString(),
        investorCount: d._count.investments,
        closesAt: d.closesAt,
      })),
      milestones: milestones.map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        dueDate: m.dueDate,
        amount: m.amount?.toString() ?? "0",
      })),
      documentsCount: documents,
    };
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

  @Get("entrepreneur/dashboard")
  @Roles(PlatformRole.ENTREPRENEUR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  getEntrepreneurDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.projectsService.getEntrepreneurDashboard(user);
  }

  @Get(":id/analytics")
  @Roles(PlatformRole.ENTREPRENEUR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  getProjectAnalytics(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.projectsService.getProjectAnalytics(id, user);
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

  @Post(":id/publish")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  publish(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    return this.projectsService.publish(id, user);
  }

  @Get(":id/gallery/:mediaId/signed-url")
  @Roles(PlatformRole.ENTREPRENEUR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  getSignedUrl(
    @Param("id") projectId: string,
    @Param("mediaId") mediaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    return this.projectsService.getSignedUrl(projectId, mediaId, user);
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

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMilestone(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.projectsService.removeMilestone(id, user);
  }
}

@Module({
  controllers: [ProjectsController, MilestonesController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
