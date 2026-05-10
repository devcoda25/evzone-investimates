import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
  InvestmentStatus,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
  ProjectStatus,
} from '@common/enums';
import {
  CreateInvestmentDto,
  UpdateInvestmentDto,
  InvestmentFilterDto,
  CreateTransactionDto,
  TransactionFilterDto,
  DepositDto,
  WithdrawalDto,
  PortfolioStatsDto,
  PortfolioPerformanceDto,
  MonthlyPerformanceDto,
  InvestmentStatsDto,
  TransactionStatsDto,
} from './dto';
import { PaginatedResponse } from '@common/dto/pagination.dto';

const INVESTMENT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'investedAt',
  'amount',
  'status',
  'confirmedAt',
  'transactionReference',
] as const;

const TRANSACTION_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'processedAt',
  'amount',
  'status',
  'type',
  'riskScore',
  'jurisdiction',
  'paymentProvider',
] as const;

const investmentInclude = {
  project: true,
  investor: true,
} satisfies Prisma.InvestmentInclude;

const transactionInclude = {
  user: true,
  investment: {
    include: {
      project: true,
    },
  },
} satisfies Prisma.TransactionInclude;

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async invest(
    investorId: string,
    projectId: string,
    dto: CreateInvestmentDto,
  ): Promise<any> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (![ProjectStatus.ACTIVE, ProjectStatus.FUNDED].includes(project.status as any)) {
      throw new BadRequestException('Project is not open for investments');
    }

    if (dto.amount < Number(project.minInvestment)) {
      throw new BadRequestException(
        `Minimum investment amount is ${project.minInvestment} ${project.currency}`,
      );
    }
    if (project.maxInvestment && dto.amount > Number(project.maxInvestment)) {
      throw new BadRequestException(
        `Maximum investment amount is ${project.maxInvestment} ${project.currency}`,
      );
    }

    const newFundingRaised = this.addDecimals(Number(project.fundingRaised), dto.amount);
    if (newFundingRaised > Number(project.fundingGoal) * 1.1) {
      throw new BadRequestException('Investment would exceed project funding goal by more than 10%');
    }

    const investment = await this.prisma.$transaction(async (tx) => {
      const createdInvestment = await tx.investment.create({
        data: {
          investorId,
          projectId,
          amount: dto.amount,
          currency: dto.currency || 'USD',
          status: InvestmentStatus.PENDING as any,
          paymentMethod: dto.paymentMethod as any,
          investedAt: new Date(),
        },
        include: investmentInclude,
      });

      await tx.transaction.create({
        data: {
          userId: investorId,
          investmentId: createdInvestment.id,
          projectId,
          type: TransactionType.INVESTMENT as any,
          amount: dto.amount,
          currency: dto.currency || 'USD',
          status: TransactionStatus.PENDING as any,
          paymentMethod: dto.paymentMethod as any,
        },
      });

      await tx.project.update({
        where: { id: projectId },
        data: {
          fundingRaised: { increment: dto.amount },
          ...(newFundingRaised >= Number(project.fundingGoal)
            ? { status: ProjectStatus.FUNDED as any }
            : {}),
        },
      });

      return createdInvestment;
    });

    this.logger.log(`Investment created: ${investment.id} for project ${projectId} by investor ${investorId}`);

    return this.normalizeInvestment(investment);
  }

  async findByInvestor(
    investorId: string,
    filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<any>> {
    return this.queryInvestments({ ...filter, investorId }, false);
  }

  async findAllInvestments(
    filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<any>> {
    return this.queryInvestments(filter, true);
  }

  async findByProject(
    projectId: string,
    filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<any>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = getSortField(filter.sortBy, INVESTMENT_SORT_FIELDS, 'createdAt');
    const sortOrder = getSortOrder(filter.sortOrder);

    const where: Prisma.InvestmentWhereInput = {
      projectId,
      status: filter.status as any,
      amount: this.buildAmountFilter(filter.minAmount, filter.maxAmount),
      investedAt: this.buildDateFilter(filter.startDate, filter.endDate),
    };

    const [investments, total] = await Promise.all([
      this.prisma.investment.findMany({
        where,
        include: investmentInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.investment.count({ where }),
    ]);

    return {
      data: investments.map((investment) => this.normalizeInvestment(investment)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async findById(id: string): Promise<any> {
    const investment = await this.prisma.investment.findUnique({
      where: { id },
      include: investmentInclude,
    });

    if (!investment) {
      throw new NotFoundException('Investment not found');
    }

    return this.normalizeInvestment(investment);
  }

  async update(id: string, dto: UpdateInvestmentDto): Promise<any> {
    await this.findById(id);

    const updated = await this.prisma.investment.update({
      where: { id },
      data: {
        status: dto.status as any,
        transactionReference: dto.transactionReference,
        equityPercentage: dto.equityPercentage,
        expectedReturns: dto.expectedReturns,
        actualReturns: dto.actualReturns,
        ...(dto.status === InvestmentStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
      },
      include: investmentInclude,
    });

    return this.normalizeInvestment(updated);
  }

  async cancel(id: string, userId: string): Promise<any> {
    const investment = await this.findById(id);

    if (investment.investorId !== userId) {
      throw new ForbiddenException('You can only cancel your own investments');
    }

    if (investment.status !== InvestmentStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel investment with status: ${investment.status}. Only PENDING investments can be cancelled.`,
      );
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updatedInvestment = await tx.investment.update({
        where: { id },
        data: { status: InvestmentStatus.CANCELLED as any },
        include: investmentInclude,
      });

      await tx.transaction.create({
        data: {
          userId: investment.investorId,
          investmentId: investment.id,
          projectId: investment.projectId,
          type: TransactionType.REFUND as any,
          amount: Number(investment.amount),
          currency: investment.currency,
          status: TransactionStatus.PENDING as any,
          paymentMethod: investment.paymentMethod as any,
          metadata: { reason: 'Investment cancelled by investor' },
        },
      });

      await tx.project.update({
        where: { id: investment.projectId },
        data: {
          fundingRaised: { decrement: Number(investment.amount) },
        },
      });

      return updatedInvestment;
    });

    this.logger.log(`Investment cancelled: ${id}`);

    return this.normalizeInvestment(cancelled);
  }

  async confirm(id: string): Promise<any> {
    const investment = await this.findById(id);

    if (investment.status !== InvestmentStatus.PENDING) {
      throw new BadRequestException(
        `Cannot confirm investment with status: ${investment.status}. Only PENDING investments can be confirmed.`,
      );
    }

    const confirmed = await this.prisma.$transaction(async (tx) => {
      const updatedInvestment = await tx.investment.update({
        where: { id },
        data: {
          status: InvestmentStatus.CONFIRMED as any,
          confirmedAt: new Date(),
        },
        include: investmentInclude,
      });

      await tx.transaction.updateMany({
        where: {
          investmentId: id,
          type: TransactionType.INVESTMENT as any,
        },
        data: {
          status: TransactionStatus.COMPLETED as any,
          processedAt: new Date(),
        },
      });

      return updatedInvestment;
    });

    this.logger.log(`Investment confirmed: ${id}`);

    return this.normalizeInvestment(confirmed);
  }

  async getPortfolio(investorId: string): Promise<{
    active: any[];
    pending: any[];
    completed: any[];
    cancelled: any[];
  }> {
    const investments = await this.prisma.investment.findMany({
      where: { investorId },
      include: { project: true },
      orderBy: { investedAt: 'desc' },
    });

    const normalized = investments.map((investment) => this.normalizeInvestment(investment));

    return {
      active: normalized.filter((investment) => investment.status === InvestmentStatus.CONFIRMED),
      pending: normalized.filter((investment) => investment.status === InvestmentStatus.PENDING),
      completed: normalized.filter(
        (investment) =>
          investment.status === InvestmentStatus.CONFIRMED && Number(investment.actualReturns) > 0,
      ),
      cancelled: normalized.filter((investment) =>
        [InvestmentStatus.CANCELLED, InvestmentStatus.REFUNDED].includes(investment.status),
      ),
    };
  }

  async getPortfolioStats(investorId: string): Promise<PortfolioStatsDto> {
    const investments = await this.prisma.investment.findMany({
      where: { investorId },
    });

    let totalInvested = 0;
    let totalReturns = 0;
    let activeInvestments = 0;
    let completedInvestments = 0;
    let pendingInvestments = 0;
    let cancelledInvestments = 0;

    for (const investment of investments) {
      const amount = Number(investment.amount);
      const actualReturns = Number(investment.actualReturns);

      if (investment.status === InvestmentStatus.CONFIRMED) {
        totalInvested = this.addDecimals(totalInvested, amount);
        totalReturns = this.addDecimals(totalReturns, actualReturns);
        activeInvestments += 1;
        if (actualReturns > 0) {
          completedInvestments += 1;
        }
      } else if (investment.status === InvestmentStatus.PENDING) {
        pendingInvestments += 1;
      } else if ([InvestmentStatus.CANCELLED, InvestmentStatus.REFUNDED].includes(investment.status as any)) {
        cancelledInvestments += 1;
      }
    }

    const netValue = this.addDecimals(totalInvested, totalReturns);
    const roiPercentage =
      totalInvested > 0 ? this.roundDecimals((totalReturns / totalInvested) * 100, 2) : 0;

    return {
      totalInvested,
      totalReturns,
      netValue,
      roiPercentage,
      activeInvestments,
      completedInvestments,
      pendingInvestments,
      cancelledInvestments,
      totalInvestments: investments.length,
    };
  }

  async getPortfolioPerformance(investorId: string): Promise<PortfolioPerformanceDto> {
    const investments = await this.prisma.investment.findMany({
      where: { investorId },
      orderBy: { investedAt: 'asc' },
    });

    const monthlyMap = new Map<string, MonthlyPerformanceDto>();

    for (const investment of investments) {
      const month = this.formatMonth(investment.investedAt);
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, {
          month,
          amountInvested: 0,
          amountReturned: 0,
          netCashFlow: 0,
          investmentCount: 0,
        });
      }

      const bucket = monthlyMap.get(month)!;
      const amount = Number(investment.amount);
      const returned = Number(investment.actualReturns);

      if (investment.status === InvestmentStatus.CONFIRMED) {
        bucket.amountInvested = this.addDecimals(bucket.amountInvested, amount);
        bucket.investmentCount += 1;
      }
      bucket.amountReturned = this.addDecimals(bucket.amountReturned, returned);
      bucket.netCashFlow = this.addDecimals(bucket.amountReturned, -bucket.amountInvested);
    }

    const months = Array.from(monthlyMap.keys()).sort();
    const monthlyData = months.map((month) => ({ ...monthlyMap.get(month)! }));

    let cumulativeInvested = 0;
    let cumulativeReturns = 0;
    const cumulativeInvestedData: { month: string; amount: number }[] = [];
    const cumulativeReturnsData: { month: string; amount: number }[] = [];

    for (const month of months) {
      const bucket = monthlyMap.get(month)!;
      cumulativeInvested = this.addDecimals(cumulativeInvested, bucket.amountInvested);
      cumulativeReturns = this.addDecimals(cumulativeReturns, bucket.amountReturned);
      cumulativeInvestedData.push({ month, amount: cumulativeInvested });
      cumulativeReturnsData.push({ month, amount: cumulativeReturns });
    }

    return {
      monthlyData,
      cumulativeInvested: cumulativeInvestedData,
      cumulativeReturns: cumulativeReturnsData,
    };
  }

  async getStats(): Promise<InvestmentStatsDto> {
    const investments = await this.prisma.investment.findMany({
      include: { project: true },
    });

    let totalAmount = 0;
    let totalReturns = 0;
    let pendingCount = 0;
    let confirmedCount = 0;
    const statusMap = new Map<string, { count: number; totalAmount: number }>();
    const sectorMap = new Map<string, { count: number; totalAmount: number }>();

    for (const investment of investments) {
      const amount = Number(investment.amount);
      const returns = Number(investment.actualReturns);
      totalAmount = this.addDecimals(totalAmount, amount);
      totalReturns = this.addDecimals(totalReturns, returns);

      const statusEntry = statusMap.get(investment.status) || { count: 0, totalAmount: 0 };
      statusEntry.count += 1;
      statusEntry.totalAmount = this.addDecimals(statusEntry.totalAmount, amount);
      statusMap.set(investment.status, statusEntry);

      if (investment.status === InvestmentStatus.PENDING) pendingCount += 1;
      if (investment.status === InvestmentStatus.CONFIRMED) confirmedCount += 1;

      const sector = investment.project?.sector || 'UNKNOWN';
      const sectorEntry = sectorMap.get(sector) || { count: 0, totalAmount: 0 };
      sectorEntry.count += 1;
      sectorEntry.totalAmount = this.addDecimals(sectorEntry.totalAmount, amount);
      sectorMap.set(sector, sectorEntry);
    }

    return {
      totalInvestments: investments.length,
      totalAmount,
      byStatus: Array.from(statusMap.entries()).map(([status, data]) => ({ status, ...data })),
      bySector: Array.from(sectorMap.entries()).map(([sector, data]) => ({ sector, ...data })),
      totalReturns,
      pendingCount,
      confirmedCount,
    };
  }

  async createTransaction(dto: CreateTransactionDto): Promise<any> {
    const transaction = await this.prisma.transaction.create({
      data: {
        type: dto.type as any,
        amount: dto.amount,
        currency: dto.currency || 'USD',
        paymentMethod: dto.paymentMethod as any,
        status: (dto.status || TransactionStatus.PENDING) as any,
        userId: dto.userId,
        investmentId: dto.investmentId,
        projectId: dto.projectId,
        paymentProvider: dto.paymentProvider,
        providerTransactionId: dto.providerTransactionId,
        fromParty: dto.fromParty,
        toParty: dto.toParty,
        riskScore: dto.riskScore,
        jurisdiction: dto.jurisdiction,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      include: transactionInclude,
    });

    return normalizePrisma(transaction);
  }

  async findTransactions(
    userId: string,
    filter: TransactionFilterDto,
  ): Promise<PaginatedResponse<any>> {
    return this.queryTransactions({ ...filter, userId });
  }

  async findAllTransactions(
    filter: TransactionFilterDto,
  ): Promise<PaginatedResponse<any>> {
    return this.queryTransactions(filter);
  }

  async findTransactionById(id: string): Promise<any> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: transactionInclude,
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return normalizePrisma(transaction);
  }

  async deposit(userId: string, dto: DepositDto): Promise<any> {
    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.DEPOSIT as any,
        amount: dto.amount,
        currency: dto.currency || 'USD',
        status: TransactionStatus.PENDING as any,
        paymentMethod: dto.paymentMethod as any,
        paymentProvider: dto.paymentProvider,
      },
      include: transactionInclude,
    });

    return normalizePrisma(transaction);
  }

  async withdraw(userId: string, dto: WithdrawalDto): Promise<any> {
    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.WITHDRAWAL as any,
        amount: dto.amount,
        currency: dto.currency || 'USD',
        status: TransactionStatus.PENDING as any,
        paymentMethod: PaymentMethod.BANK_TRANSFER as any,
        metadata: {
          bankDetails: dto.bankDetails,
          note: dto.note,
        },
      },
      include: transactionInclude,
    });

    return normalizePrisma(transaction);
  }

  async processTransaction(id: string): Promise<any> {
    return this.completePendingTransaction(id, 'process');
  }

  async approveTransaction(id: string): Promise<any> {
    return this.completePendingTransaction(id, 'approve');
  }

  async holdTransaction(id: string): Promise<any> {
    const transaction = await this.findTransactionById(id);
    if (![TransactionStatus.PENDING, TransactionStatus.COMPLETED].includes(transaction.status)) {
      throw new BadRequestException('Only pending or completed transactions can be held');
    }

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        status: TransactionStatus.PENDING as any,
        processedAt: null,
      },
      include: transactionInclude,
    });

    return normalizePrisma(updated);
  }

  async escalateTransaction(id: string, notes?: string): Promise<any> {
    const transaction = await this.findTransactionById(id);
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        metadata: {
          ...(transaction.metadata || {}),
          escalated: true,
          escalationNotes: notes,
          escalatedAt: new Date().toISOString(),
        },
      },
      include: transactionInclude,
    });

    return normalizePrisma(updated);
  }

  async reverseTransaction(id: string, reason?: string): Promise<any> {
    const transaction = await this.findTransactionById(id);
    if (transaction.status === TransactionStatus.CANCELLED) {
      throw new BadRequestException('Transaction is already cancelled');
    }

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        status: TransactionStatus.CANCELLED as any,
        metadata: {
          ...(transaction.metadata || {}),
          reversed: true,
          reversalReason: reason,
          reversedAt: new Date().toISOString(),
        },
      },
      include: transactionInclude,
    });

    return normalizePrisma(updated);
  }

  async findRelatedTransactions(projectId: string, excludeId: string): Promise<any[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        projectId,
        NOT: { id: excludeId },
      },
      include: transactionInclude,
      orderBy: { createdAt: 'desc' },
    });

    return transactions.map((transaction) => normalizePrisma(transaction));
  }

  async getTransactionStats(): Promise<TransactionStatsDto> {
    const transactions = await this.prisma.transaction.findMany();

    let totalVolume = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalFees = 0;
    const typeMap = new Map<string, { count: number; totalAmount: number }>();
    const statusMap = new Map<string, { count: number; totalAmount: number }>();

    for (const transaction of transactions) {
      const amount = Number(transaction.amount);
      totalVolume = this.addDecimals(totalVolume, amount);

      const typeEntry = typeMap.get(transaction.type) || { count: 0, totalAmount: 0 };
      typeEntry.count += 1;
      typeEntry.totalAmount = this.addDecimals(typeEntry.totalAmount, amount);
      typeMap.set(transaction.type, typeEntry);

      const statusEntry = statusMap.get(transaction.status) || { count: 0, totalAmount: 0 };
      statusEntry.count += 1;
      statusEntry.totalAmount = this.addDecimals(statusEntry.totalAmount, amount);
      statusMap.set(transaction.status, statusEntry);

      if (transaction.type === TransactionType.DEPOSIT) {
        totalDeposits = this.addDecimals(totalDeposits, amount);
      }
      if (transaction.type === TransactionType.WITHDRAWAL) {
        totalWithdrawals = this.addDecimals(totalWithdrawals, amount);
      }
      if (transaction.type === TransactionType.FEE) {
        totalFees = this.addDecimals(totalFees, amount);
      }
    }

    return {
      totalTransactions: transactions.length,
      totalVolume,
      byType: Array.from(typeMap.entries()).map(([type, data]) => ({ type, ...data })),
      byStatus: Array.from(statusMap.entries()).map(([status, data]) => ({ status, ...data })),
      totalDeposits,
      totalWithdrawals,
      totalFees,
    };
  }

  private async queryInvestments(
    filter: InvestmentFilterDto & { investorId?: string },
    includeInvestor: boolean,
  ): Promise<PaginatedResponse<any>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = getSortField(filter.sortBy, INVESTMENT_SORT_FIELDS, 'createdAt');
    const sortOrder = getSortOrder(filter.sortOrder);

    const where: Prisma.InvestmentWhereInput = {
      investorId: filter.investorId,
      status: filter.status as any,
      projectId: filter.projectId,
      amount: this.buildAmountFilter(filter.minAmount, filter.maxAmount),
      investedAt: this.buildDateFilter(filter.startDate, filter.endDate),
    };

    if (filter.search) {
      where.OR = [
        { transactionReference: { contains: filter.search, mode: 'insensitive' } },
        { project: { title: { contains: filter.search, mode: 'insensitive' } } },
      ];
    }

    const include = includeInvestor ? investmentInclude : { project: true };

    const [investments, total] = await Promise.all([
      this.prisma.investment.findMany({
        where,
        include,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.investment.count({ where }),
    ]);

    return {
      data: investments.map((investment) => this.normalizeInvestment(investment)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  private async queryTransactions(
    filter: TransactionFilterDto & { userId?: string },
  ): Promise<PaginatedResponse<any>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = getSortField(filter.sortBy, TRANSACTION_SORT_FIELDS, 'createdAt');
    const sortOrder = getSortOrder(filter.sortOrder);

    const where: Prisma.TransactionWhereInput = {
      userId: filter.userId,
      type: filter.type as any,
      status: filter.status as any,
      investmentId: filter.investmentId,
      projectId: filter.projectId,
      amount: this.buildAmountFilter(filter.minAmount, filter.maxAmount),
      createdAt: this.buildDateFilter(filter.startDate, filter.endDate),
      jurisdiction: filter.jurisdiction,
      ...(filter.maxRiskScore !== undefined ? { riskScore: { lte: filter.maxRiskScore } } : {}),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: transactionInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions.map((transaction) => normalizePrisma(transaction)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  private async completePendingTransaction(id: string, action: string): Promise<any> {
    const transaction = await this.findTransactionById(id);

    if (transaction.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(
        `Cannot ${action} transaction with status: ${transaction.status}. Only PENDING transactions can be completed.`,
      );
    }

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        status: TransactionStatus.COMPLETED as any,
        processedAt: new Date(),
      },
      include: transactionInclude,
    });

    return normalizePrisma(updated);
  }

  private normalizeInvestment(investment: any) {
    const normalized = normalizePrisma(investment);
    if (normalized.project) {
      normalized.project = withFundingProgress(normalized.project);
    }
    return normalized;
  }

  private buildDateFilter(startDate?: string, endDate?: string): Prisma.DateTimeFilter | undefined {
    if (!startDate && !endDate) {
      return undefined;
    }

    return {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  private buildAmountFilter(minAmount?: number, maxAmount?: number): Prisma.DecimalFilter | undefined {
    if (minAmount === undefined && maxAmount === undefined) {
      return undefined;
    }

    return {
      ...(minAmount !== undefined ? { gte: minAmount } : {}),
      ...(maxAmount !== undefined ? { lte: maxAmount } : {}),
    };
  }

  private addDecimals(a: number, b: number): number {
    return this.roundDecimals(a + b, 2);
  }

  private roundDecimals(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private formatMonth(date: Date): string {
    const parsed = new Date(date);
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}
