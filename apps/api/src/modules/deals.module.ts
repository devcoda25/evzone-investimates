import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import {
  DealStatus,
  InvestmentStatus,
  LedgerDirection,
  LedgerOwnerType,
  PaymentMethod,
  PlatformRole,
  Prisma,
  ProjectStatus,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";
import {
  assertBalancedLedgerDraft,
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

class DealFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;

  @IsOptional()
  @IsString()
  projectId?: string;
}

class CreateDealDto {
  @IsString()
  projectId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  minInvestment?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  targetAmount?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  opensAt?: string;

  @IsOptional()
  @IsString()
  closesAt?: string;
}

class UpdateDealDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  minInvestment?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  targetAmount?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  opensAt?: string;

  @IsOptional()
  @IsString()
  closesAt?: string;
}

class DealInvestmentDto {
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  currency?: string;
}

interface DealResponse {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  status: DealStatus;
  currency: string;
  minInvestment: string;
  targetAmount: string;
  maxAmount: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
  project: { id: string; title: string; slug: string; status: ProjectStatus };
  investmentCount: number;
  totalCommitted: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly permissions: PermissionsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) { }

  async create(
    dto: CreateDealDto,
    user: AuthenticatedUser,
  ): Promise<DealResponse> {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project || project.deletedAt)
      throw new NotFoundException("Project not found");
    this.permissions.assertTenantAccess(user, project.tenantId);
    if (
      !this.permissions.isPlatformAdmin(user) &&
      project.ownerUserId !== user.id
    ) {
      throw new BadRequestException("You can only create deals for your own projects");
    }
    const deal = await this.transactions.run(async (tx) => {
      const created = await tx.deal.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          title: dto.title,
          minInvestment: dto.minInvestment ?? Number(project.minInvestment),
          targetAmount: dto.targetAmount ?? Number(project.fundingTarget),
          maxAmount: dto.maxAmount ?? null,
          currency: dto.currency ?? project.currency,
          opensAt: dto.opensAt ? new Date(dto.opensAt) : undefined,
          closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
        },
        include: { project: true, investments: true },
      });
      await this.outbox.create(tx, {
        tenantId: project.tenantId,
        topic: "deal.created",
        eventType: "deal.created",
        aggregateType: "deal",
        aggregateId: created.id,
        payload: { dealId: created.id, projectId: project.id, userId: user.id },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "deal.created",
        "deal",
        created.id,
        undefined,
        { title: created.title, status: created.status, projectId: created.projectId },
        undefined,
        tx as any,
      );
      return created;
    });
    return this.toResponse(deal);
  }

  async findAll(filter: DealFilterDto): Promise<PaginatedResponse<DealResponse>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.DealWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.projectId) where.projectId = filter.projectId;
    const [data, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include: { project: true, investments: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deal.count({ where }),
    ]);
    return { data: data.map((d) => this.toResponse(d)), meta: toPaginationMeta(page, limit, total) };
  }

  async findOne(id: string): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    return this.toResponse(deal);
  }

  async update(
    id: string,
    dto: UpdateDealDto,
    user: AuthenticatedUser,
  ): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    this.permissions.assertTenantAccess(user, deal.tenantId);
    if (
      !this.permissions.isPlatformAdmin(user) &&
      deal.project.ownerUserId !== user.id
    ) {
      throw new BadRequestException("You can only update your own deals");
    }
    const editableStatuses: DealStatus[] = [DealStatus.DRAFT, DealStatus.COMPLIANCE_REVIEW];
    if (!editableStatuses.includes(deal.status)) {
      throw new BadRequestException("Cannot update a deal that is already live");
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.deal.update({
        where: { id },
        data: {
          title: dto.title,
          minInvestment: dto.minInvestment,
          targetAmount: dto.targetAmount,
          maxAmount: dto.maxAmount,
          currency: dto.currency,
          opensAt: dto.opensAt ? new Date(dto.opensAt) : undefined,
          closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
        },
        include: { project: true, investments: true },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "deal.updated",
        "deal",
        id,
        { title: deal.title, minInvestment: deal.minInvestment, targetAmount: deal.targetAmount },
        { title: dto.title, minInvestment: dto.minInvestment, targetAmount: dto.targetAmount },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async approve(id: string, user: AuthenticatedUser): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.DRAFT && deal.status !== DealStatus.COMPLIANCE_REVIEW) {
      throw new BadRequestException("Deal must be in DRAFT or COMPLIANCE_REVIEW to approve");
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.deal.update({
        where: { id },
        data: { status: DealStatus.APPROVED },
        include: { project: true, investments: true },
      });
      await this.outbox.create(tx, {
        tenantId: deal.tenantId,
        topic: "deal.approved",
        eventType: "deal.approved",
        aggregateType: "deal",
        aggregateId: id,
        payload: { dealId: id, projectId: deal.projectId, userId: user.id },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "deal.approved",
        "deal",
        id,
        { status: deal.status },
        { status: DealStatus.APPROVED },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async open(id: string, user: AuthenticatedUser): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.APPROVED) {
      throw new BadRequestException("Deal must be APPROVED before opening");
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.deal.update({
        where: { id },
        data: { status: DealStatus.LIVE, opensAt: new Date() },
        include: { project: true, investments: true },
      });
      await this.outbox.create(tx, {
        tenantId: deal.tenantId,
        topic: "deal.opened",
        eventType: "deal.opened",
        aggregateType: "deal",
        aggregateId: id,
        payload: { dealId: id, projectId: deal.projectId },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "deal.opened",
        "deal",
        id,
        { status: deal.status },
        { status: DealStatus.LIVE },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async pause(id: string, user: AuthenticatedUser): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.LIVE) {
      throw new BadRequestException("Only live deals can be paused");
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.deal.update({
        where: { id },
        data: { status: DealStatus.PAUSED },
        include: { project: true, investments: true },
      });
      await this.outbox.create(tx, {
        tenantId: deal.tenantId,
        topic: "deal.paused",
        eventType: "deal.paused",
        aggregateType: "deal",
        aggregateId: id,
        payload: { dealId: id, projectId: deal.projectId },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "deal.paused",
        "deal",
        id,
        { status: deal.status },
        { status: DealStatus.PAUSED },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async close(
    id: string,
    successful: boolean,
    user: AuthenticatedUser,
  ): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    const closableStatuses: DealStatus[] = [DealStatus.LIVE, DealStatus.PAUSED];
    if (!closableStatuses.includes(deal.status)) {
      throw new BadRequestException("Only live or paused deals can be closed");
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.deal.update({
        where: { id },
        data: {
          status: successful
            ? DealStatus.CLOSED_SUCCESSFUL
            : DealStatus.CLOSED_FAILED,
          closesAt: new Date(),
        },
        include: { project: true, investments: true },
      });
      await this.outbox.create(tx, {
        tenantId: deal.tenantId,
        topic: "deal.closed",
        eventType: "deal.closed",
        aggregateType: "deal",
        aggregateId: id,
        payload: { dealId: id, projectId: deal.projectId, successful },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "deal.closed",
        "deal",
        id,
        { status: deal.status },
        { status: successful ? DealStatus.CLOSED_SUCCESSFUL : DealStatus.CLOSED_FAILED },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async submit(id: string, user: AuthenticatedUser): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.DRAFT) {
      throw new BadRequestException("Only draft deals can be submitted for compliance review");
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.deal.update({
        where: { id },
        data: { status: DealStatus.COMPLIANCE_REVIEW },
        include: { project: true, investments: true },
      });
      await this.outbox.create(tx, {
        tenantId: deal.tenantId,
        topic: "deal.submitted",
        eventType: "deal.submitted",
        aggregateType: "deal",
        aggregateId: id,
        payload: { dealId: id, projectId: deal.projectId },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "deal.submitted",
        "deal",
        id,
        { status: deal.status },
        { status: DealStatus.COMPLIANCE_REVIEW },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async reject(id: string, user: AuthenticatedUser): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.COMPLIANCE_REVIEW) {
      throw new BadRequestException("Only deals under compliance review can be rejected");
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.deal.update({
        where: { id },
        data: { status: DealStatus.CANCELLED },
        include: { project: true, investments: true },
      });
      await this.outbox.create(tx, {
        tenantId: deal.tenantId,
        topic: "deal.rejected",
        eventType: "deal.rejected",
        aggregateType: "deal",
        aggregateId: id,
        payload: { dealId: id, projectId: deal.projectId },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "deal.rejected",
        "deal",
        id,
        { status: deal.status },
        { status: DealStatus.CANCELLED },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async resume(id: string, user: AuthenticatedUser): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.PAUSED) {
      throw new BadRequestException("Only paused deals can be resumed");
    }
    const updated = await this.transactions.run(async (tx) => {
      const result = await tx.deal.update({
        where: { id },
        data: { status: DealStatus.LIVE },
        include: { project: true, investments: true },
      });
      await this.outbox.create(tx, {
        tenantId: deal.tenantId,
        topic: "deal.resumed",
        eventType: "deal.resumed",
        aggregateType: "deal",
        aggregateId: id,
        payload: { dealId: id, projectId: deal.projectId },
      });
      await this.audit.recordFromRequest(
        { ip: "", headers: {}, user },
        "deal.resumed",
        "deal",
        id,
        { status: deal.status },
        { status: DealStatus.LIVE },
        undefined,
        tx as any,
      );
      return result;
    });
    return this.toResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException("Deal not found");
    await this.prisma.deal.update({
      where: { id },
      data: { status: DealStatus.CANCELLED },
    });
  }

  async invest(
    dealId: string,
    dto: DealInvestmentDto,
    investor: AuthenticatedUser,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const key = idempotencyKey ?? `${investor.id}-${dealId}-${Date.now()}`;
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { project: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.LIVE) {
      throw new BadRequestException("This deal is not open for investment");
    }
    if (dto.amount < Number(deal.minInvestment)) {
      throw new BadRequestException(
        `Minimum investment for this deal is ${deal.minInvestment.toString()} ${deal.currency}`,
      );
    }
    if (deal.maxAmount) {
      const totalCommitted = await this.prisma.investment.aggregate({
        where: { dealId },
        _sum: { amount: true },
      });
      if (Number(totalCommitted._sum.amount ?? 0) + dto.amount > Number(deal.maxAmount)) {
        throw new BadRequestException("Investment exceeds deal maximum amount");
      }
    }
    const created = await this.transactions.run(async (tx) => {
      const investment = await tx.investment.create({
        data: {
          tenantId: deal.tenantId,
          dealId: deal.id,
          projectId: deal.projectId,
          investorUserId: investor.id,
          amount: dto.amount,
          currency: dto.currency ?? deal.currency,
          status: InvestmentStatus.PENDING_COMPLIANCE,
          idempotencyKey: key,
          paymentMethod: dto.paymentMethod,
        },
        include: { project: true, investor: true },
      });
      const transaction = await tx.transaction.create({
        data: {
          tenantId: deal.tenantId,
          userId: investor.id,
          investmentId: investment.id,
          projectId: deal.projectId,
          type: TransactionType.INVESTMENT,
          amount: dto.amount,
          currency: dto.currency ?? deal.currency,
          status: TransactionStatus.PENDING,
          paymentMethod: dto.paymentMethod,
          jurisdiction: deal.project.countryCode,
        },
      });
      const newFundingRaised =
        Number(deal.project.fundingRaised) + dto.amount;
      await tx.project.update({
        where: { id: deal.projectId },
        data: {
          fundingRaised: { increment: dto.amount },
          status:
            newFundingRaised >= Number(deal.project.fundingTarget)
              ? ProjectStatus.FUNDED
              : deal.project.status,
        },
      });
      await this.postCommitmentLedger(
        tx,
        deal.tenantId,
        investor.id,
        deal.projectId,
        transaction.id,
        dto.amount,
        dto.currency ?? deal.currency,
      );
      await this.outbox.create(tx, {
        tenantId: deal.tenantId,
        topic: "investment.created",
        eventType: "investment.created",
        aggregateType: "investment",
        aggregateId: investment.id,
        payload: {
          investmentId: investment.id,
          dealId: deal.id,
          projectId: deal.projectId,
          investorUserId: investor.id,
          amount: dto.amount,
        },
      });
      return investment;
    });
    return {
      id: created.id,
      dealId: created.dealId,
      projectId: created.projectId,
      amount: created.amount.toString(),
      currency: created.currency,
      status: created.status,
      paymentMethod: created.paymentMethod,
      idempotencyKey: created.idempotencyKey,
      createdAt: created.createdAt,
    };
  }

  private async postCommitmentLedger(
    tx: Prisma.TransactionClient,
    tenantId: string,
    investorUserId: string,
    projectId: string,
    transactionId: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    const investorAccount = await tx.ledgerAccount.upsert({
      where: {
        tenantId_ownerType_ownerId_currency_name: {
          tenantId,
          ownerType: LedgerOwnerType.USER,
          ownerId: investorUserId,
          currency,
          name: "Investor Cash Pending",
        },
      },
      create: {
        tenantId,
        ownerType: LedgerOwnerType.USER,
        ownerId: investorUserId,
        currency,
        name: "Investor Cash Pending",
      },
      update: {},
    });
    const escrowAccount = await tx.ledgerAccount.upsert({
      where: {
        tenantId_ownerType_ownerId_currency_name: {
          tenantId,
          ownerType: LedgerOwnerType.PROJECT,
          ownerId: projectId,
          currency,
          name: "Escrow Liability",
        },
      },
      create: {
        tenantId,
        ownerType: LedgerOwnerType.PROJECT,
        ownerId: projectId,
        currency,
        name: "Escrow Liability",
      },
      update: {},
    });
    assertBalancedLedgerDraft([
      { direction: "DEBIT", amount },
      { direction: "CREDIT", amount },
    ]);
    await tx.ledgerEntry.createMany({
      data: [
        {
          tenantId,
          accountId: investorAccount.id,
          transactionId,
          direction: LedgerDirection.DEBIT,
          amount,
          currency,
          memo: "Investment commitment pending",
        },
        {
          tenantId,
          accountId: escrowAccount.id,
          transactionId,
          direction: LedgerDirection.CREDIT,
          amount,
          currency,
          memo: "Escrow liability pending",
        },
      ],
    });
  }

  private toResponse(
    deal: Prisma.DealGetPayload<{ include: { project: true; investments: true } }>,
  ): DealResponse {
    const totalCommitted = deal.investments.reduce(
      (sum, inv) => sum + Number(inv.amount),
      0,
    );
    return {
      id: deal.id,
      tenantId: deal.tenantId,
      projectId: deal.projectId,
      title: deal.title,
      status: deal.status,
      currency: deal.currency,
      minInvestment: deal.minInvestment.toString(),
      targetAmount: deal.targetAmount.toString(),
      maxAmount: deal.maxAmount?.toString() ?? null,
      opensAt: deal.opensAt,
      closesAt: deal.closesAt,
      project: {
        id: deal.project.id,
        title: deal.project.title,
        slug: deal.project.slug,
        status: deal.project.status,
      },
      investmentCount: deal.investments.length,
      totalCommitted: totalCommitted.toString(),
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
    };
  }
}

@ApiTags("Deals")
@ApiBearerAuth()
@Controller("deals")
class DealsController {
  constructor(private readonly dealsService: DealsService) { }

  @Public()
  @Get()
  findAll(
    @Query() filter: DealFilterDto,
  ): Promise<PaginatedResponse<DealResponse>> {
    return this.dealsService.findAll(filter);
  }

  @Public()
  @Get(":id")
  findOne(@Param("id") id: string): Promise<DealResponse> {
    return this.dealsService.findOne(id);
  }

  @Post()
  @Roles(
    PlatformRole.ENTREPRENEUR,
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  create(
    @Body() dto: CreateDealDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.create(dto, user);
  }

  @Patch(":id")
  @Roles(
    PlatformRole.ENTREPRENEUR,
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDealDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.update(id, dto, user);
  }

  @Post(":id/approve")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  approve(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.approve(id, user);
  }

  @Post(":id/open")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN, PlatformRole.ENTREPRENEUR)
  open(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.open(id, user);
  }

  @Post(":id/pause")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN, PlatformRole.ENTREPRENEUR)
  pause(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.pause(id, user);
  }

  @Post(":id/close")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  close(
    @Param("id") id: string,
    @Body("successful") successful: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.close(id, successful, user);
  }

  @Post(":id/submit")
  @Roles(PlatformRole.ENTREPRENEUR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  submit(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.submit(id, user);
  }

  @Post(":id/reject")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  reject(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.reject(id, user);
  }

  @Post(":id/resume")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  resume(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.resume(id, user);
  }

  @Delete(":id")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  remove(@Param("id") id: string): Promise<void> {
    return this.dealsService.remove(id);
  }

  @Post(":id/invest")
  @Roles(PlatformRole.INVESTOR)
  invest(
    @Param("id") id: string,
    @Body() dto: DealInvestmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<unknown> {
    return this.dealsService.invest(id, dto, user, idempotencyKey);
  }
}

@Module({
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule { }
