import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
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
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";
import {
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
  AuthenticatedUser,
  assertBalancedLedgerDraft,
  CurrentUser,
  getLimit,
  getPage,
  PaginatedResponse,
  PaginationDto,
  Roles,
  toPaginationMeta,
} from "@evzone/common";
import { PrismaService, TransactionService } from "@evzone/database";
import { OutboxService } from "@evzone/events";
import { PermissionsService } from "@evzone/permissions";

class InvestmentFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(InvestmentStatus)
  status?: InvestmentStatus;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  minAmount?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  maxAmount?: number;
}

class CreateInvestmentDto {
  @IsString()
  projectId!: string;

  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

class UpdateInvestmentDto {
  @IsOptional()
  @IsEnum(InvestmentStatus)
  status?: InvestmentStatus;

  @IsOptional()
  @IsString()
  transactionReference?: string;
}

class TransactionFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsString()
  investmentId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  maxRiskScore?: number;

  @IsOptional()
  @IsString()
  jurisdiction?: string;
}

class DepositDto {
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  paymentProvider?: string;
}

class WithdrawalDto {
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  bankDetails?: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  note?: string;
}

type InvestmentWithProject = Prisma.InvestmentGetPayload<{
  include: { project: true; investor: true };
}>;

@Injectable()
class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly outbox: OutboxService,
    private readonly permissions: PermissionsService,
  ) {}

  async invest(
    investor: AuthenticatedUser,
    dto: CreateInvestmentDto,
    headerKey?: string,
  ): Promise<unknown> {
    const idempotencyKey = dto.idempotencyKey ?? headerKey;
    if (!idempotencyKey)
      throw new BadRequestException(
        "Idempotency-Key header or idempotencyKey body field is required",
      );
    const existing = await this.prisma.investment.findUnique({
      where: {
        investorUserId_idempotencyKey: {
          investorUserId: investor.id,
          idempotencyKey,
        },
      },
      include: { project: true, investor: true },
    });
    if (existing) return this.toInvestmentResponse(existing);

    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project || project.deletedAt)
      throw new NotFoundException("Project not found");
    const investableStatuses: ProjectStatus[] = [
      ProjectStatus.ACTIVE,
      ProjectStatus.LISTED,
      ProjectStatus.FUNDING,
    ];
    if (!investableStatuses.includes(project.status)) {
      throw new BadRequestException("Project is not open for investments");
    }
    if (dto.amount < Number(project.minInvestment))
      throw new BadRequestException(
        `Minimum investment amount is ${project.minInvestment.toString()} ${project.currency}`,
      );
    if (project.maxInvestment && dto.amount > Number(project.maxInvestment)) {
      throw new BadRequestException(
        `Maximum investment amount is ${project.maxInvestment.toString()} ${project.currency}`,
      );
    }

    const created = await this.transactions.run(async (tx) => {
      const investment = await tx.investment.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          investorUserId: investor.id,
          amount: dto.amount,
          currency: dto.currency ?? project.currency,
          status: InvestmentStatus.PENDING_COMPLIANCE,
          idempotencyKey,
          paymentMethod: dto.paymentMethod,
        },
      });
      const transaction = await tx.transaction.create({
        data: {
          tenantId: project.tenantId,
          userId: investor.id,
          investmentId: investment.id,
          projectId: project.id,
          type: TransactionType.INVESTMENT,
          amount: dto.amount,
          currency: dto.currency ?? project.currency,
          status: TransactionStatus.PENDING,
          paymentMethod: dto.paymentMethod,
          jurisdiction: project.countryCode,
        },
      });
      await this.postCommitmentLedger(
        tx,
        project.tenantId,
        investor.id,
        project.id,
        transaction.id,
        dto.amount,
        dto.currency ?? project.currency,
      );
      const newFundingRaised = Number(project.fundingRaised) + dto.amount;
      await tx.project.update({
        where: { id: project.id },
        data: {
          fundingRaised: { increment: dto.amount },
          status:
            newFundingRaised >= Number(project.fundingTarget)
              ? ProjectStatus.FUNDED
              : project.status,
        },
      });
      await this.outbox.create(tx, {
        tenantId: project.tenantId,
        topic: "investment.created",
        eventType: "investment.created",
        aggregateType: "investment",
        aggregateId: investment.id,
        payload: {
          investmentId: investment.id,
          projectId: project.id,
          investorUserId: investor.id,
          amount: dto.amount,
        },
      });
      return tx.investment.findUniqueOrThrow({
        where: { id: investment.id },
        include: { project: true, investor: true },
      });
    });
    return this.toInvestmentResponse(created);
  }

  async findByInvestor(
    user: AuthenticatedUser,
    filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.queryInvestments(filter, { investorUserId: user.id });
  }

  async findAllInvestments(
    user: AuthenticatedUser,
    filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<unknown>> {
    const where = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
    return this.queryInvestments(filter, where);
  }

  async findByProject(
    projectId: string,
    user: AuthenticatedUser,
    filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<unknown>> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException("Project not found");
    this.permissions.assertOwnerOrAdmin(user, project.ownerUserId);
    return this.queryInvestments(filter, { projectId });
  }

  async findById(id: string, user: AuthenticatedUser): Promise<unknown> {
    const investment = await this.prisma.investment.findUnique({
      where: { id },
      include: { project: true, investor: true },
    });
    if (!investment) throw new NotFoundException("Investment not found");
    if (
      !this.permissions.isPlatformAdmin(user) &&
      investment.investorUserId !== user.id &&
      investment.project.ownerUserId !== user.id
    ) {
      throw new ForbiddenException("You can only view your own investments");
    }
    return this.toInvestmentResponse(investment);
  }

  async update(id: string, dto: UpdateInvestmentDto): Promise<unknown> {
    const investment = await this.prisma.investment.update({
      where: { id },
      data: {
        status: dto.status,
        confirmedAt:
          dto.status === InvestmentStatus.CONFIRMED ? new Date() : undefined,
      },
      include: { project: true, investor: true },
    });
    return this.toInvestmentResponse(investment);
  }

  async cancel(id: string, user: AuthenticatedUser): Promise<unknown> {
    const investment = await this.prisma.investment.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!investment) throw new NotFoundException("Investment not found");
    if (investment.investorUserId !== user.id)
      throw new ForbiddenException("You can only cancel your own investments");
    const cancellableStatuses: InvestmentStatus[] = [
      InvestmentStatus.PENDING_COMPLIANCE,
      InvestmentStatus.PENDING_PAYMENT,
      InvestmentStatus.COMMITTED,
    ];
    if (!cancellableStatuses.includes(investment.status)) {
      throw new BadRequestException(
        "Only pending investments can be cancelled",
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          tenantId: investment.tenantId,
          userId: user.id,
          investmentId: investment.id,
          projectId: investment.projectId,
          type: TransactionType.REFUND,
          amount: investment.amount,
          currency: investment.currency,
          status: TransactionStatus.PENDING,
          paymentMethod: investment.paymentMethod,
          metadata: { reason: "Investment cancelled by investor" },
        },
      });
      await tx.project.update({
        where: { id: investment.projectId },
        data: { fundingRaised: { decrement: investment.amount } },
      });
      return tx.investment.update({
        where: { id },
        data: { status: InvestmentStatus.CANCELLED },
        include: { project: true, investor: true },
      });
    });
    return this.toInvestmentResponse(updated);
  }

  async confirm(id: string): Promise<unknown> {
    const investment = await this.prisma.investment.update({
      where: { id },
      data: { status: InvestmentStatus.CONFIRMED, confirmedAt: new Date() },
      include: { project: true, investor: true },
    });
    await this.prisma.transaction.updateMany({
      where: { investmentId: id, type: TransactionType.INVESTMENT },
      data: { status: TransactionStatus.COMPLETED, processedAt: new Date() },
    });
    return this.toInvestmentResponse(investment);
  }

  async getPortfolio(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown[]>> {
    const investments = await this.prisma.investment.findMany({
      where: { investorUserId: user.id },
      include: { project: true, investor: true },
      orderBy: { createdAt: "desc" },
    });
    const mapped = investments.map((investment) =>
      this.toInvestmentResponse(investment),
    );
    return {
      active: mapped.filter(
        (investment) => investment.status === InvestmentStatus.CONFIRMED,
      ),
      pending: mapped.filter(
        (investment) =>
          investment.status !== InvestmentStatus.CONFIRMED &&
          investment.status !== InvestmentStatus.CANCELLED,
      ),
      completed: mapped.filter(
        (investment) => investment.status === InvestmentStatus.CONFIRMED,
      ),
      cancelled: mapped.filter(
        (investment) =>
          investment.status === InvestmentStatus.CANCELLED ||
          investment.status === InvestmentStatus.REFUNDED,
      ),
    };
  }

  async getPortfolioStats(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const aggregate = await this.prisma.investment.aggregate({
      where: { investorUserId: user.id, status: InvestmentStatus.CONFIRMED },
      _sum: { amount: true },
      _count: { id: true },
    });
    const pending = await this.prisma.investment.count({
      where: {
        investorUserId: user.id,
        status: { not: InvestmentStatus.CONFIRMED },
      },
    });
    return {
      totalInvested: aggregate._sum.amount?.toString() ?? "0",
      totalReturns: "0",
      netValue: aggregate._sum.amount?.toString() ?? "0",
      roiPercentage: 0,
      activeInvestments: aggregate._count.id,
      completedInvestments: aggregate._count.id,
      pendingInvestments: pending,
      cancelledInvestments: await this.prisma.investment.count({
        where: { investorUserId: user.id, status: InvestmentStatus.CANCELLED },
      }),
      totalInvestments: await this.prisma.investment.count({
        where: { investorUserId: user.id },
      }),
    };
  }

  async getPortfolioPerformance(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown[]>> {
    const investments = await this.prisma.investment.findMany({
      where: { investorUserId: user.id },
      orderBy: { createdAt: "asc" },
    });
    return {
      monthlyData: investments.map((investment) => ({
        month: `${investment.createdAt.getFullYear()}-${String(investment.createdAt.getMonth() + 1).padStart(2, "0")}`,
        amountInvested: investment.amount.toString(),
        amountReturned: "0",
        netCashFlow: investment.amount.mul(-1).toString(),
        investmentCount: 1,
      })),
      cumulativeInvested: [],
      cumulativeReturns: [],
    };
  }

  async createTransaction(
    user: AuthenticatedUser,
    type: TransactionType,
    dto: DepositDto | WithdrawalDto,
  ): Promise<unknown> {
    const transaction = await this.prisma.transaction.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        type,
        amount: dto.amount,
        currency: dto.currency ?? "USD",
        status: TransactionStatus.PENDING,
        paymentMethod:
          type === TransactionType.WITHDRAWAL
            ? PaymentMethod.BANK_TRANSFER
            : (dto as DepositDto).paymentMethod,
        paymentProvider:
          type === TransactionType.DEPOSIT
            ? (dto as DepositDto).paymentProvider
            : undefined,
        metadata:
          type === TransactionType.WITHDRAWAL
            ? {
                bankDetails: (dto as WithdrawalDto).bankDetails ?? null,
                note: (dto as WithdrawalDto).note ?? null,
              }
            : undefined,
      },
    });
    return transaction;
  }

  async findTransactions(
    user: AuthenticatedUser,
    filter: TransactionFilterDto,
  ): Promise<PaginatedResponse<unknown>> {
    const where = this.permissions.isPlatformAdmin(user)
      ? this.transactionWhere(filter)
      : { ...this.transactionWhere(filter), userId: user.id };
    const page = getPage(filter);
    const limit = getLimit(filter);
    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: this.transactionOrderBy(filter.sortBy, filter.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(page, limit, total) };
  }

  async findTransactionById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!transaction) throw new NotFoundException("Transaction not found");
    if (
      !this.permissions.isPlatformAdmin(user) &&
      transaction.userId !== user.id
    ) {
      throw new ForbiddenException("You can only view your own transactions");
    }
    return transaction;
  }

  async findRelatedTransactions(
    id: string,
    user: AuthenticatedUser,
  ): Promise<unknown[]> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!transaction) throw new NotFoundException("Transaction not found");
    if (
      !this.permissions.isPlatformAdmin(user) &&
      transaction.userId !== user.id
    ) {
      throw new ForbiddenException("You can only view your own transactions");
    }
    if (!transaction.projectId) return [];
    return this.prisma.transaction.findMany({
      where: { projectId: transaction.projectId, id: { not: transaction.id } },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateTransactionStatus(
    id: string,
    status: TransactionStatus,
    metadata?: Prisma.InputJsonValue,
  ): Promise<unknown> {
    return this.prisma.transaction.update({
      where: { id },
      data: {
        status,
        processedAt:
          status === TransactionStatus.COMPLETED ? new Date() : undefined,
        metadata,
      },
    });
  }

  async getTransactionStats(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const where = this.permissions.isPlatformAdmin(user)
      ? {}
      : { tenantId: user.tenantId };
    const [totalCount, completed, byStatus, byType] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.aggregate({
        where: { ...where, status: TransactionStatus.COMPLETED },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["status"],
        where,
        _count: { status: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["type"],
        where,
        _count: { type: true },
      }),
    ]);
    return {
      totalTransactions: totalCount,
      totalVolume: completed._sum.amount?.toString() ?? "0",
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count.status,
      })),
      byType: byType.map((row) => ({ type: row.type, count: row._count.type })),
    };
  }

  private async queryInvestments(
    filter: InvestmentFilterDto,
    baseWhere: Prisma.InvestmentWhereInput,
  ): Promise<PaginatedResponse<unknown>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.InvestmentWhereInput = {
      ...baseWhere,
      status: filter.status,
      projectId: filter.projectId ?? baseWhere.projectId,
      amount: {
        gte: filter.minAmount,
        lte: filter.maxAmount,
      },
    };
    const [data, total] = await Promise.all([
      this.prisma.investment.findMany({
        where,
        include: { project: true, investor: true },
        orderBy: this.investmentOrderBy(filter.sortBy, filter.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.investment.count({ where }),
    ]);
    return {
      data: data.map((investment) => this.toInvestmentResponse(investment)),
      meta: toPaginationMeta(page, limit, total),
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

  private investmentOrderBy(
    sortBy: string | undefined,
    sortOrder: "asc" | "desc" = "desc",
  ): Prisma.InvestmentOrderByWithRelationInput {
    if (sortBy === "amount") return { amount: sortOrder };
    if (sortBy === "updatedAt") return { updatedAt: sortOrder };
    return { createdAt: sortOrder };
  }

  private transactionOrderBy(
    sortBy: string | undefined,
    sortOrder: "asc" | "desc" = "desc",
  ): Prisma.TransactionOrderByWithRelationInput {
    if (sortBy === "amount") return { amount: sortOrder };
    if (sortBy === "processedAt") return { processedAt: sortOrder };
    return { createdAt: sortOrder };
  }

  private transactionWhere(
    filter: TransactionFilterDto,
  ): Prisma.TransactionWhereInput {
    return {
      type: filter.type,
      status: filter.status,
      investmentId: filter.investmentId,
      projectId: filter.projectId,
      riskScore:
        filter.maxRiskScore === undefined
          ? undefined
          : { lte: filter.maxRiskScore },
      jurisdiction: filter.jurisdiction,
    };
  }

  private toInvestmentResponse(investment: InvestmentWithProject): {
    id: string;
    tenantId: string;
    investorId: string;
    investorUserId: string;
    projectId: string;
    amount: string;
    currency: string;
    status: InvestmentStatus;
    paymentMethod: PaymentMethod | null;
    idempotencyKey: string;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    project: { id: string; title: string; slug: string };
  } {
    return {
      id: investment.id,
      tenantId: investment.tenantId,
      investorId: investment.investorUserId,
      investorUserId: investment.investorUserId,
      projectId: investment.projectId,
      amount: investment.amount.toString(),
      currency: investment.currency,
      status: investment.status,
      paymentMethod: investment.paymentMethod,
      idempotencyKey: investment.idempotencyKey,
      confirmedAt: investment.confirmedAt,
      createdAt: investment.createdAt,
      updatedAt: investment.updatedAt,
      project: {
        id: investment.project.id,
        title: investment.project.title,
        slug: investment.project.slug,
      },
    };
  }
}

@ApiTags("Investments")
@ApiBearerAuth()
@Controller("investments")
class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Get("portfolio")
  @Roles(PlatformRole.INVESTOR)
  getPortfolio(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown[]>> {
    return this.investmentsService.getPortfolio(user);
  }

  @Get("portfolio/stats")
  @Roles(PlatformRole.INVESTOR)
  getPortfolioStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.investmentsService.getPortfolioStats(user);
  }

  @Get("portfolio/performance")
  @Roles(PlatformRole.INVESTOR)
  getPortfolioPerformance(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown[]>> {
    return this.investmentsService.getPortfolioPerformance(user);
  }

  @Get("project/:projectId")
  @Roles(
    PlatformRole.ENTREPRENEUR,
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  findByProject(
    @Param("projectId") projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.investmentsService.findByProject(projectId, user, filter);
  }

  @Post()
  @Roles(PlatformRole.INVESTOR)
  invest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvestmentDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<unknown> {
    return this.investmentsService.invest(user, dto, idempotencyKey);
  }

  @Get()
  @Roles(PlatformRole.INVESTOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  findByInvestor(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<unknown>> {
    if (
      user.role === PlatformRole.ADMIN ||
      user.role === PlatformRole.SUPER_ADMIN
    ) {
      return this.investmentsService.findAllInvestments(user, filter);
    }
    return this.investmentsService.findByInvestor(user, filter);
  }

  @Get(":id")
  findById(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.investmentsService.findById(id, user);
  }

  @Patch(":id")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateInvestmentDto,
  ): Promise<unknown> {
    return this.investmentsService.update(id, dto);
  }

  @Post(":id/cancel")
  @Roles(PlatformRole.INVESTOR)
  cancel(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.investmentsService.cancel(id, user);
  }

  @Post(":id/confirm")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  confirm(@Param("id") id: string): Promise<unknown> {
    return this.investmentsService.confirm(id);
  }
}

@ApiTags("Transactions")
@ApiBearerAuth()
@Controller("transactions")
class TransactionsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Get("stats")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  getTransactionStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.investmentsService.getTransactionStats(user);
  }

  @Get()
  findTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: TransactionFilterDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.investmentsService.findTransactions(user, filter);
  }

  @Get(":id/related")
  findRelatedTransactions(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.investmentsService.findRelatedTransactions(id, user);
  }

  @Get(":id")
  findTransactionById(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.investmentsService.findTransactionById(id, user);
  }

  @Post("deposit")
  deposit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DepositDto,
  ): Promise<unknown> {
    return this.investmentsService.createTransaction(
      user,
      TransactionType.DEPOSIT,
      dto,
    );
  }

  @Post("withdraw")
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WithdrawalDto,
  ): Promise<unknown> {
    return this.investmentsService.createTransaction(
      user,
      TransactionType.WITHDRAWAL,
      dto,
    );
  }

  @Post(":id/approve")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  approveTransaction(@Param("id") id: string): Promise<unknown> {
    return this.investmentsService.updateTransactionStatus(
      id,
      TransactionStatus.COMPLETED,
    );
  }

  @Post(":id/hold")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  holdTransaction(@Param("id") id: string): Promise<unknown> {
    return this.investmentsService.updateTransactionStatus(
      id,
      TransactionStatus.PENDING,
    );
  }

  @Post(":id/escalate")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  escalateTransaction(
    @Param("id") id: string,
    @Body("notes") notes?: string,
  ): Promise<unknown> {
    return this.investmentsService.updateTransactionStatus(
      id,
      TransactionStatus.FLAGGED,
      {
        escalated: true,
        escalationNotes: notes ?? null,
        escalatedAt: new Date().toISOString(),
      },
    );
  }

  @Post(":id/reverse")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  reverseTransaction(
    @Param("id") id: string,
    @Body("reason") reason?: string,
  ): Promise<unknown> {
    return this.investmentsService.updateTransactionStatus(
      id,
      TransactionStatus.CANCELLED,
      {
        reversed: true,
        reversalReason: reason ?? null,
        reversedAt: new Date().toISOString(),
      },
    );
  }

  @Post(":id/process")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  processTransaction(@Param("id") id: string): Promise<unknown> {
    return this.investmentsService.updateTransactionStatus(
      id,
      TransactionStatus.COMPLETED,
    );
  }
}

@Module({
  controllers: [InvestmentsController, TransactionsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
