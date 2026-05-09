import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
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
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import {
  AssessorAvailability,
  DueDiligenceCategory,
  DueDiligenceStatus,
  PlatformRole,
  Prisma,
  ProjectStatus,
  RiskRating,
  TaskStatus,
} from "@prisma/client";
import {
  AuthenticatedUser,
  CurrentUser,
  getLimit,
  getPage,
  PaginatedResponse,
  PaginationDto,
  Roles,
  toPaginationMeta,
} from "@evzone/common";
import { PrismaService, TransactionService } from "@evzone/database";
import { AuditService } from "@evzone/audit";
import { OutboxService } from "@evzone/events";

class EngagementFilterDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

class CreateEngagementDto {
  @IsString()
  projectId!: string;

  @IsString()
  providerId!: string;

  @IsString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateEngagementDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  financialAssessment?: Prisma.InputJsonValue;

  @IsOptional()
  technicalAssessment?: Prisma.InputJsonValue;

  @IsOptional()
  legalAssessment?: Prisma.InputJsonValue;

  @IsOptional()
  esgAssessment?: Prisma.InputJsonValue;

  @IsOptional()
  marketAssessment?: Prisma.InputJsonValue;
}

class SubmitReportDto extends UpdateEngagementDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  overallScore?: number;

  @IsOptional()
  @IsEnum(RiskRating)
  riskLevel?: RiskRating;

  @IsOptional()
  reportDocuments?: Prisma.InputJsonValue;
}

class ReviewReportDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class CreateTaskDto {
  @IsEnum(DueDiligenceCategory)
  category!: DueDiligenceCategory;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}

class UpdateTaskDto {
  @IsOptional()
  @IsEnum(DueDiligenceCategory)
  category?: DueDiligenceCategory;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}

class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

class SaveAssessmentsDto {
  @IsOptional()
  financialAssessment?: Prisma.InputJsonValue;

  @IsOptional()
  technicalAssessment?: Prisma.InputJsonValue;

  @IsOptional()
  legalAssessment?: Prisma.InputJsonValue;

  @IsOptional()
  esgAssessment?: Prisma.InputJsonValue;

  @IsOptional()
  marketAssessment?: Prisma.InputJsonValue;
}

class AttachEvidenceDto {
  @IsString()
  documentId!: string;

  @IsOptional()
  @IsString()
  taskId?: string;
}

class AssessorFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AssessorAvailability)
  availability?: AssessorAvailability;

  @IsOptional()
  @IsString()
  specialties?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsInt()
  rating?: number;
}

@Injectable()
class DueDiligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createEngagement(dto: CreateEngagementDto): Promise<unknown> {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException("Project not found");
    const assessor = await this.prisma.user.findUnique({
      where: { id: dto.providerId },
      include: { memberships: true, assessorProfile: true },
    });
    if (
      !assessor?.assessorProfile ||
      !assessor.memberships.some(
        (membership) => membership.role === PlatformRole.ASSESSOR,
      )
    ) {
      throw new BadRequestException("Selected user is not an assessor");
    }
    const existing = await this.prisma.dueDiligenceCase.findUnique({
      where: { projectId: project.id },
    });
    const inactiveStatuses: DueDiligenceStatus[] = [
      DueDiligenceStatus.APPROVED,
      DueDiligenceStatus.REJECTED,
      DueDiligenceStatus.EXPIRED,
    ];
    if (existing && !inactiveStatuses.includes(existing.status)) {
      throw new BadRequestException(
        "Project already has an active due diligence case",
      );
    }
    const created = await this.transactions.run(async (tx) => {
      const result = await tx.dueDiligenceCase.upsert({
        where: { projectId: project.id },
        create: {
          tenantId: project.tenantId,
          projectId: project.id,
          assignedAssessorId: assessor.id,
          status: DueDiligenceStatus.ASSIGNED,
          dueAt: new Date(dto.dueDate),
          assignedAt: new Date(),
          notes: dto.notes,
        },
        update: {
          assignedAssessorId: assessor.id,
          status: DueDiligenceStatus.ASSIGNED,
          dueAt: new Date(dto.dueDate),
          assignedAt: new Date(),
          notes: dto.notes,
        },
        include: {
          project: true,
          assignedAssessor: { include: { user: true } },
          tasks: true,
          evidenceDocuments: true,
          evidenceMedia: true,
        },
      });
      await this.outbox.create(tx, {
        tenantId: project.tenantId,
        topic: "due_diligence.assigned",
        eventType: "due_diligence.assigned",
        aggregateType: "due_diligence",
        aggregateId: result.id,
        payload: { caseId: result.id, projectId: project.id, assessorId: assessor.id },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user: assessor },
        "due_diligence.assigned",
        "due_diligence",
        result.id,
        undefined,
        { status: DueDiligenceStatus.ASSIGNED, assessorId: assessor.id },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toEngagementResponse(created);
  }

  async findEngagements(
    filter: EngagementFilterDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.DueDiligenceCaseWhereInput = {
      tenantId:
        user.role === PlatformRole.SUPER_ADMIN ||
        user.role === PlatformRole.ADMIN
          ? undefined
          : user.tenantId,
      assignedAssessorId:
        user.role === PlatformRole.ASSESSOR ? user.id : filter.providerId,
      projectId: filter.projectId,
      status: filter.status ? this.normalizeStatus(filter.status) : undefined,
    };
    const [data, total] = await Promise.all([
      this.prisma.dueDiligenceCase.findMany({
        where,
        include: {
          project: true,
          assignedAssessor: { include: { user: true } },
          tasks: true,
          evidenceDocuments: true,
          evidenceMedia: true,
        },
        orderBy: this.orderBy(filter.sortBy, filter.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dueDiligenceCase.count({ where }),
    ]);
    return {
      data: data.map((item) => this.toEngagementResponse(item)),
      meta: toPaginationMeta(page, limit, total),
    };
  }

  async findByIdWithAccess(
    id: string,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const engagement = await this.getCase(id);
    if (
      user.role === PlatformRole.ASSESSOR &&
      engagement.assignedAssessorId !== user.id
    ) {
      throw new ForbiddenException("You can only access your own engagements");
    }
    return this.toEngagementResponse(engagement);
  }

  async updateEngagement(
    id: string,
    dto: UpdateEngagementDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const engagement = await this.getCase(id);
    if (
      user.role === PlatformRole.ASSESSOR &&
      engagement.assignedAssessorId !== user.id
    ) {
      throw new ForbiddenException("You can only update your own engagements");
    }
    const status = dto.status ? this.normalizeStatus(dto.status) : undefined;
    if (
      user.role === PlatformRole.ASSESSOR &&
      (status === DueDiligenceStatus.APPROVED ||
        status === DueDiligenceStatus.REJECTED)
    ) {
      throw new ForbiddenException(
        "Assessors cannot approve or reject due diligence",
      );
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.dueDiligenceCase.update({
        where: { id },
        data: {
          status,
          notes: dto.notes,
          assessments: this.mergeAssessments(engagement.assessments, dto),
        },
        include: {
          project: true,
          assignedAssessor: { include: { user: true } },
          tasks: true,
          evidenceDocuments: true,
          evidenceMedia: true,
        },
      });
      await this.outbox.create(tx, {
        tenantId: engagement.tenantId,
        topic: "due_diligence.status_changed",
        eventType: "due_diligence.status_changed",
        aggregateType: "due_diligence",
        aggregateId: id,
        payload: { caseId: id, status },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user: engagement.assignedAssessor?.user },
        "due_diligence.status_changed",
        "due_diligence",
        id,
        { status: engagement.status },
        { status },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toEngagementResponse(updated);
  }

  async startEngagement(id: string, assessorId: string): Promise<unknown> {
    const engagement = await this.getCase(id);
    if (engagement.assignedAssessorId !== assessorId)
      throw new ForbiddenException("You can only start your own engagements");
    if (engagement.status !== DueDiligenceStatus.ASSIGNED)
      throw new BadRequestException(
        `Cannot start engagement with status: ${engagement.status}`,
      );
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.dueDiligenceCase.update({
        where: { id },
        data: { status: DueDiligenceStatus.IN_PROGRESS, startedAt: new Date() },
        include: {
          project: true,
          assignedAssessor: { include: { user: true } },
          tasks: true,
          evidenceDocuments: true,
          evidenceMedia: true,
        },
      });
      await this.outbox.create(tx, {
        tenantId: engagement.tenantId,
        topic: "due_diligence.started",
        eventType: "due_diligence.started",
        aggregateType: "due_diligence",
        aggregateId: id,
        payload: { caseId: id, assessorId },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user: engagement.assignedAssessor?.user },
        "due_diligence.started",
        "due_diligence",
        id,
        { status: engagement.status },
        { status: DueDiligenceStatus.IN_PROGRESS },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toEngagementResponse(updated);
  }

  async submitReport(
    id: string,
    assessorId: string,
    dto: SubmitReportDto,
  ): Promise<unknown> {
    const engagement = await this.getCase(id);
    if (engagement.assignedAssessorId !== assessorId)
      throw new ForbiddenException("You can only submit your own reports");
    const submittableStatuses: DueDiligenceStatus[] = [
      DueDiligenceStatus.ASSIGNED,
      DueDiligenceStatus.IN_PROGRESS,
      DueDiligenceStatus.NEEDS_INFORMATION,
    ];
    if (!submittableStatuses.includes(engagement.status)) {
      throw new BadRequestException(
        `Cannot submit report for engagement with status: ${engagement.status}`,
      );
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.dueDiligenceCase.update({
        where: { id },
        data: {
          status: DueDiligenceStatus.QUALITY_REVIEW,
          submittedAt: new Date(),
          riskScore: dto.overallScore,
          riskRating: dto.riskLevel,
          notes: dto.notes,
          assessments: this.mergeAssessments(engagement.assessments, dto),
          finalReportDocumentId: this.extractDocumentId(dto.reportDocuments),
        },
        include: {
          project: true,
          assignedAssessor: { include: { user: true } },
          tasks: true,
          evidenceDocuments: true,
          evidenceMedia: true,
        },
      });
      await this.outbox.create(tx, {
        tenantId: engagement.tenantId,
        topic: "due_diligence.completed",
        eventType: "due_diligence.completed",
        aggregateType: "due_diligence",
        aggregateId: id,
        payload: { caseId: id, riskScore: dto.overallScore },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user: engagement.assignedAssessor?.user },
        "due_diligence.completed",
        "due_diligence",
        id,
        { status: engagement.status },
        { status: DueDiligenceStatus.QUALITY_REVIEW },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toEngagementResponse(updated);
  }

  async reviewReport(id: string, dto: ReviewReportDto): Promise<unknown> {
    const status = this.normalizeStatus(dto.status);
    if (
      status !== DueDiligenceStatus.APPROVED &&
      status !== DueDiligenceStatus.REJECTED
    ) {
      throw new BadRequestException(
        "Review status must resolve to APPROVED or REJECTED",
      );
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.dueDiligenceCase.update({
        where: { id },
        data: { status, reviewedAt: new Date(), notes: dto.notes },
        include: {
          project: true,
          assignedAssessor: { include: { user: true } },
          tasks: true,
          evidenceDocuments: true,
          evidenceMedia: true,
        },
      });
      const eventType = status === DueDiligenceStatus.APPROVED
        ? "due_diligence.approved"
        : "due_diligence.rejected";
      await this.outbox.create(tx, {
        tenantId: result.tenantId,
        topic: eventType,
        eventType,
        aggregateType: "due_diligence",
        aggregateId: id,
        payload: { caseId: id, status },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user: result.assignedAssessor?.user },
        eventType,
        "due_diligence",
        id,
        { status: result.status },
        { status },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toEngagementResponse(updated);
  }

  async createTask(
    caseId: string,
    dto: CreateTaskDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const engagement = await this.getCase(caseId);
    this.assertCaseAccess(user, engagement);
    const task = await this.prisma.dueDiligenceTask.create({
      data: {
        caseId,
        category: dto.category,
        title: dto.title,
        notes: dto.notes,
        assignedToUserId: dto.assignedToUserId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: { assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return this.toTaskResponse(task);
  }

  async updateTask(
    taskId: string,
    dto: UpdateTaskDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const task = await this.getTaskWithCase(taskId);
    this.assertTaskAccess(user, task);
    const updated = await this.prisma.dueDiligenceTask.update({
      where: { id: taskId },
      data: {
        category: dto.category,
        title: dto.title,
        notes: dto.notes,
        assignedToUserId: dto.assignedToUserId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: { assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return this.toTaskResponse(updated);
  }

  async deleteTask(taskId: string, user: AuthenticatedUser): Promise<void> {
    const task = await this.getTaskWithCase(taskId);
    this.assertTaskAccess(user, task);
    await this.prisma.dueDiligenceTask.delete({ where: { id: taskId } });
  }

  async updateTaskStatus(
    taskId: string,
    dto: UpdateTaskStatusDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const task = await this.getTaskWithCase(taskId);
    this.assertTaskAccess(user, task);
    this.assertValidTransition(task.status, dto.status);
    const updated = await this.prisma.dueDiligenceTask.update({
      where: { id: taskId },
      data: { status: dto.status },
      include: { assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return this.toTaskResponse(updated);
  }

  async attachEvidence(
    caseId: string,
    dto: AttachEvidenceDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const engagement = await this.getCase(caseId);
    this.assertCaseAccess(user, engagement);
    const document = await this.prisma.document.findUnique({
      where: { id: dto.documentId },
    });
    if (!document) throw new NotFoundException("Document not found");
    const updated = await this.prisma.document.update({
      where: { id: dto.documentId },
      data: {
        dueDiligenceCaseId: caseId,
        dueDiligenceTaskId: dto.taskId ?? null,
      },
    });
    return updated;
  }

  async listEvidence(caseId: string): Promise<unknown[]> {
    const documents = await this.prisma.document.findMany({
      where: { dueDiligenceCaseId: caseId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return documents;
  }

  async saveAssessments(
    caseId: string,
    dto: SaveAssessmentsDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const engagement = await this.getCase(caseId);
    this.assertCaseAccess(user, engagement);
    const updated = await this.prisma.dueDiligenceCase.update({
      where: { id: caseId },
      data: {
        assessments: this.mergeAssessments(engagement.assessments, dto as unknown as UpdateEngagementDto),
      },
      include: {
        project: true,
        assignedAssessor: { include: { user: true } },
        tasks: true,
        evidenceDocuments: true,
        evidenceMedia: true,
      },
    });
    return this.toEngagementResponse(updated);
  }

  async findAvailableProjects(): Promise<unknown[]> {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [
            ProjectStatus.ACTIVE,
            ProjectStatus.UNDER_REVIEW,
            ProjectStatus.SUBMITTED,
          ],
        },
        dueDiligence: null,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findAssessors(
    filter: AssessorFilterDto,
  ): Promise<PaginatedResponse<unknown>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.UserWhereInput = {
      memberships: { some: { role: PlatformRole.ASSESSOR, status: "ACTIVE" } },
      status: { not: "SUSPENDED" },
      assessorProfile: {
        availabilityStatus: filter.availability,
        rating:
          filter.rating === undefined ? undefined : { gte: filter.rating },
        specialties: filter.specialties
          ? {
              hasSome: filter.specialties.split(",").map((item) => item.trim()),
            }
          : undefined,
      },
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { assessorProfile: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(page, limit, total) };
  }

  async getStats(): Promise<Record<string, unknown>> {
    const [total, byStatus, average] = await Promise.all([
      this.prisma.dueDiligenceCase.count(),
      this.prisma.dueDiligenceCase.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      this.prisma.dueDiligenceCase.aggregate({
        where: { riskScore: { not: null } },
        _avg: { riskScore: true },
      }),
    ]);
    return {
      totalEngagements: total,
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count.status]),
      ),
      averageScore: average._avg.riskScore,
    };
  }

  private async getCase(id: string): Promise<
    Prisma.DueDiligenceCaseGetPayload<{
      include: {
        project: true;
        assignedAssessor: { include: { user: true } };
        tasks: true;
        evidenceDocuments: true;
        evidenceMedia: true;
      };
    }>
  > {
    const engagement = await this.prisma.dueDiligenceCase.findUnique({
      where: { id },
      include: {
        project: true,
        assignedAssessor: { include: { user: true } },
        tasks: true,
        evidenceDocuments: true,
        evidenceMedia: true,
      },
    });
    if (!engagement) throw new NotFoundException("Engagement not found");
    return engagement;
  }

  private async getTaskWithCase(taskId: string): Promise<
    Prisma.DueDiligenceTaskGetPayload<{
      include: {
        case: true;
        assignedTo: { select: { id: true; firstName: true; lastName: true; email: true } };
      };
    }>
  > {
    const task = await this.prisma.dueDiligenceTask.findUnique({
      where: { id: taskId },
      include: {
        case: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!task) throw new NotFoundException("Task not found");
    return task;
  }

  private assertCaseAccess(
    user: AuthenticatedUser,
    engagement: Prisma.DueDiligenceCaseGetPayload<{
      include: { assignedAssessor: { include: { user: true } }; tasks: true };
    }>,
  ): void {
    if (
      user.role !== PlatformRole.ADMIN &&
      user.role !== PlatformRole.SUPER_ADMIN &&
      engagement.assignedAssessorId !== user.id
    ) {
      throw new ForbiddenException("You do not have access to this engagement");
    }
  }

  private assertTaskAccess(
    user: AuthenticatedUser,
    task: Prisma.DueDiligenceTaskGetPayload<{
      include: { case: true; assignedTo: { select: { id: true } } };
    }>,
  ): void {
    if (
      user.role === PlatformRole.ADMIN ||
      user.role === PlatformRole.SUPER_ADMIN
    ) {
      return;
    }
    if (task.case.assignedAssessorId !== user.id && task.assignedTo?.id !== user.id) {
      throw new ForbiddenException("You do not have access to this task");
    }
  }

  private assertValidTransition(current: TaskStatus, next: TaskStatus): void {
    const allowed: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.OPEN]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
      [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED, TaskStatus.BLOCKED, TaskStatus.OPEN],
      [TaskStatus.BLOCKED]: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
      [TaskStatus.COMPLETED]: [TaskStatus.IN_PROGRESS],
      [TaskStatus.CANCELLED]: [],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `Invalid status transition from ${current} to ${next}`,
      );
    }
  }

  private normalizeStatus(status: string): DueDiligenceStatus {
    const upper = status.toUpperCase();
    if (upper === "UNDER_REVIEW") return DueDiligenceStatus.QUALITY_REVIEW;
    if (upper === "COMPLETED") return DueDiligenceStatus.APPROVED;
    if (upper in DueDiligenceStatus)
      return DueDiligenceStatus[upper as keyof typeof DueDiligenceStatus];
    throw new BadRequestException(
      `Unsupported due diligence status: ${status}`,
    );
  }

  private mergeAssessments(
    current: Prisma.JsonValue | null,
    dto: UpdateEngagementDto,
  ): Prisma.InputJsonValue {
    const base =
      current && typeof current === "object" && !Array.isArray(current)
        ? current
        : {};
    return {
      ...base,
      financialAssessment: dto.financialAssessment,
      technicalAssessment: dto.technicalAssessment,
      legalAssessment: dto.legalAssessment,
      esgAssessment: dto.esgAssessment,
      marketAssessment: dto.marketAssessment,
    };
  }

  private extractDocumentId(
    value: Prisma.InputJsonValue | undefined,
  ): string | undefined {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !("documentId" in value)
    )
      return undefined;
    return typeof value.documentId === "string" ? value.documentId : undefined;
  }

  private orderBy(
    sortBy: string | undefined,
    sortOrder: "asc" | "desc" = "desc",
  ): Prisma.DueDiligenceCaseOrderByWithRelationInput {
    if (sortBy === "dueAt") return { dueAt: sortOrder };
    if (sortBy === "updatedAt") return { updatedAt: sortOrder };
    return { createdAt: sortOrder };
  }

  private toEngagementResponse(
    engagement: Prisma.DueDiligenceCaseGetPayload<{
      include: {
        project: true;
        assignedAssessor: { include: { user: true } };
        tasks: true;
        evidenceDocuments: true;
        evidenceMedia: true;
      };
    }>,
  ): Record<string, unknown> {
    return {
      id: engagement.id,
      tenantId: engagement.tenantId,
      projectId: engagement.projectId,
      providerId: engagement.assignedAssessorId,
      assignedAssessorId: engagement.assignedAssessorId,
      status: engagement.status,
      dueDate: engagement.dueAt,
      assignedAt: engagement.assignedAt,
      startedAt: engagement.startedAt,
      submittedAt: engagement.submittedAt,
      reviewedAt: engagement.reviewedAt,
      notes: engagement.notes,
      overallScore: engagement.riskScore,
      riskLevel: engagement.riskRating,
      project: engagement.project,
      provider: engagement.assignedAssessor?.user ?? null,
      assessor: engagement.assignedAssessor,
      tasks: engagement.tasks,
      assessments: engagement.assessments,
      reportDocuments: engagement.finalReportDocumentId
        ? { documentId: engagement.finalReportDocumentId }
        : null,
      evidenceDocuments: engagement.evidenceDocuments,
      evidenceMedia: engagement.evidenceMedia,
      createdAt: engagement.createdAt,
      updatedAt: engagement.updatedAt,
    };
  }

  private toTaskResponse(
    task: Prisma.DueDiligenceTaskGetPayload<{
      include: {
        assignedTo: { select: { id: true; firstName: true; lastName: true; email: true } };
      };
    }>,
  ): Record<string, unknown> {
    return {
      id: task.id,
      caseId: task.caseId,
      category: task.category,
      title: task.title,
      status: task.status,
      assignedToUserId: task.assignedToUserId,
      assignedTo: task.assignedTo,
      dueAt: task.dueAt,
      notes: task.notes,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}

@ApiTags("Due Diligence")
@ApiBearerAuth()
@Controller("due-diligence")
class DueDiligenceController {
  constructor(private readonly service: DueDiligenceService) {}

  @Get("engagements")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  findEngagements(
    @Query() filter: EngagementFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    return this.service.findEngagements(filter, user);
  }

  @Get("engagements/:id")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  findById(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.findByIdWithAccess(id, user);
  }

  @Post("engagements")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  createEngagement(@Body() dto: CreateEngagementDto): Promise<unknown> {
    return this.service.createEngagement(dto);
  }

  @Patch("engagements/:id")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  updateEngagement(
    @Param("id") id: string,
    @Body() dto: UpdateEngagementDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.updateEngagement(id, dto, user);
  }

  @Post("engagements/:id/start")
  @Roles(PlatformRole.ASSESSOR)
  startEngagement(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
  ): Promise<unknown> {
    return this.service.startEngagement(id, userId);
  }

  @Post("engagements/:id/submit")
  @Roles(PlatformRole.ASSESSOR)
  submitReport(
    @Param("id") id: string,
    @Body() dto: SubmitReportDto,
    @CurrentUser("id") userId: string,
  ): Promise<unknown> {
    return this.service.submitReport(id, userId, dto);
  }

  @Post("engagements/:id/review")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  reviewReport(
    @Param("id") id: string,
    @Body() dto: ReviewReportDto,
  ): Promise<unknown> {
    return this.service.reviewReport(id, dto);
  }

  @Get("projects")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  findAvailableProjects(): Promise<unknown[]> {
    return this.service.findAvailableProjects();
  }

  @Get("assessors")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  findAssessors(
    @Query() filter: AssessorFilterDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.service.findAssessors(filter);
  }

  @Get("stats/overview")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  getStats(): Promise<Record<string, unknown>> {
    return this.service.getStats();
  }

  @Post("engagements/:id/tasks")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  createTask(
    @Param("id") caseId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.createTask(caseId, dto, user);
  }

  @Patch("tasks/:taskId")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  updateTask(
    @Param("taskId") taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.updateTask(taskId, dto, user);
  }

  @Post("tasks/:taskId/status")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  updateTaskStatus(
    @Param("taskId") taskId: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.updateTaskStatus(taskId, dto, user);
  }

  @Delete("tasks/:taskId")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  deleteTask(
    @Param("taskId") taskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.service.deleteTask(taskId, user);
  }

  @Post("engagements/:id/evidence")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  attachEvidence(
    @Param("id") caseId: string,
    @Body() dto: AttachEvidenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.attachEvidence(caseId, dto, user);
  }

  @Get("engagements/:id/evidence")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  listEvidence(@Param("id") caseId: string): Promise<unknown[]> {
    return this.service.listEvidence(caseId);
  }

  @Post("engagements/:id/assessments")
  @Roles(PlatformRole.ASSESSOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  saveAssessments(
    @Param("id") caseId: string,
    @Body() dto: SaveAssessmentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.saveAssessments(caseId, dto, user);
  }
}

@Module({
  controllers: [DueDiligenceController],
  providers: [DueDiligenceService],
  exports: [DueDiligenceService],
})
export class DueDiligenceModule {}
