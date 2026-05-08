import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Brackets } from 'typeorm';
import { Investment } from './entities/investment.entity';
import { Transaction } from './entities/transaction.entity';
import { Project } from '@modules/projects/entities/project.entity';
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

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(
    @InjectRepository(Investment)
    private readonly investmentRepo: Repository<Investment>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly dataSource: DataSource,
  ) {}

  // ───────────────────────────────────────────────
  // Investment Methods
  // ───────────────────────────────────────────────

  async invest(
    investorId: string,
    projectId: string,
    dto: CreateInvestmentDto,
  ): Promise<Investment> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.status !== ProjectStatus.ACTIVE && project.status !== ProjectStatus.FUNDED) {
      throw new BadRequestException(
        'Project is not open for investments',
      );
    }

    // Validate min/max investment
    if (dto.amount < project.minInvestment) {
      throw new BadRequestException(
        `Minimum investment amount is ${project.minInvestment} ${project.currency}`,
      );
    }
    if (project.maxInvestment && dto.amount > project.maxInvestment) {
      throw new BadRequestException(
        `Maximum investment amount is ${project.maxInvestment} ${project.currency}`,
      );
    }

    // Check if funding goal would be exceeded
    const newFundingRaised = this.addDecimals(project.fundingRaised, dto.amount);
    if (newFundingRaised > project.fundingGoal * 1.1) {
      throw new BadRequestException(
        'Investment would exceed project funding goal by more than 10%',
      );
    }

    // Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create investment
      const investment = this.investmentRepo.create({
        investorId,
        projectId,
        amount: dto.amount,
        currency: dto.currency || 'USD',
        status: InvestmentStatus.PENDING,
        paymentMethod: dto.paymentMethod,
        investedAt: new Date(),
      });

      const savedInvestment = await queryRunner.manager.save(investment);

      // Create transaction record
      const transaction = this.transactionRepo.create({
        userId: investorId,
        investmentId: savedInvestment.id,
        projectId,
        type: TransactionType.INVESTMENT,
        amount: dto.amount,
        currency: dto.currency || 'USD',
        status: TransactionStatus.PENDING,
        paymentMethod: dto.paymentMethod,
      });

      await queryRunner.manager.save(transaction);

      // Update project funding raised using raw SQL for decimal precision
      await queryRunner.manager.increment(
        Project,
        { id: projectId },
        'fundingRaised',
        dto.amount,
      );

      // If project reached funding goal, update status
      if (newFundingRaised >= project.fundingGoal) {
        await queryRunner.manager.update(Project, { id: projectId }, {
          status: ProjectStatus.FUNDED,
        });
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Investment created: ${savedInvestment.id} for project ${projectId} by investor ${investorId}`,
      );

      return savedInvestment;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to create investment: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findByInvestor(
    investorId: string,
    filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<Investment>> {
    const {
      page = 1,
      limit = 20,
      status,
      projectId,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const skip = (page - 1) * limit;

    const query = this.investmentRepo
      .createQueryBuilder('investment')
      .leftJoinAndSelect('investment.project', 'project')
      .where('investment.investorId = :investorId', { investorId });

    if (status) {
      query.andWhere('investment.status = :status', { status });
    }

    if (projectId) {
      query.andWhere('investment.projectId = :projectId', { projectId });
    }

    if (startDate && endDate) {
      query.andWhere('investment.investedAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      query.andWhere('investment.investedAt >= :startDate', { startDate });
    } else if (endDate) {
      query.andWhere('investment.investedAt <= :endDate', { endDate });
    }

    if (minAmount !== undefined) {
      query.andWhere('investment.amount >= :minAmount', { minAmount });
    }

    if (maxAmount !== undefined) {
      query.andWhere('investment.amount <= :maxAmount', { maxAmount });
    }

    if (search) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('project.title ILIKE :search', { search: `%${search}%` })
            .orWhere('investment.transactionReference ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    query.orderBy(`investment.${sortBy}`, sortOrder);

    const [data, total] = await query.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  async findAllInvestments(
    filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<Investment>> {
    const {
      page = 1,
      limit = 20,
      status,
      projectId,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const skip = (page - 1) * limit;

    const query = this.investmentRepo
      .createQueryBuilder('investment')
      .leftJoinAndSelect('investment.project', 'project')
      .leftJoinAndSelect('investment.investor', 'investor');

    if (status) {
      query.andWhere('investment.status = :status', { status });
    }

    if (projectId) {
      query.andWhere('investment.projectId = :projectId', { projectId });
    }

    if (startDate && endDate) {
      query.andWhere('investment.investedAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      query.andWhere('investment.investedAt >= :startDate', { startDate });
    } else if (endDate) {
      query.andWhere('investment.investedAt <= :endDate', { endDate });
    }

    if (minAmount !== undefined) {
      query.andWhere('investment.amount >= :minAmount', { minAmount });
    }

    if (maxAmount !== undefined) {
      query.andWhere('investment.amount <= :maxAmount', { maxAmount });
    }

    if (search) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('project.title ILIKE :search', { search: `%${search}%` })
            .orWhere('investment.transactionReference ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    query.orderBy(`investment.${sortBy}`, sortOrder);

    const [data, total] = await query.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  async findByProject(
    projectId: string,
    filter: InvestmentFilterDto,
  ): Promise<PaginatedResponse<Investment>> {
    const {
      page = 1,
      limit = 20,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const skip = (page - 1) * limit;

    const query = this.investmentRepo
      .createQueryBuilder('investment')
      .leftJoinAndSelect('investment.investor', 'investor')
      .where('investment.projectId = :projectId', { projectId });

    if (status) {
      query.andWhere('investment.status = :status', { status });
    }

    if (startDate && endDate) {
      query.andWhere('investment.investedAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      query.andWhere('investment.investedAt >= :startDate', { startDate });
    } else if (endDate) {
      query.andWhere('investment.investedAt <= :endDate', { endDate });
    }

    if (minAmount !== undefined) {
      query.andWhere('investment.amount >= :minAmount', { minAmount });
    }

    if (maxAmount !== undefined) {
      query.andWhere('investment.amount <= :maxAmount', { maxAmount });
    }

    query.orderBy(`investment.${sortBy}`, sortOrder);

    const [data, total] = await query.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  async findById(id: string): Promise<Investment> {
    const investment = await this.investmentRepo.findOne({
      where: { id },
      relations: ['project', 'investor'],
    });

    if (!investment) {
      throw new NotFoundException('Investment not found');
    }

    return investment;
  }

  async update(id: string, dto: UpdateInvestmentDto): Promise<Investment> {
    const investment = await this.findById(id);

    if (dto.status) {
      investment.status = dto.status;
      if (dto.status === InvestmentStatus.CONFIRMED) {
        investment.confirmedAt = new Date();
      }
    }

    if (dto.transactionReference !== undefined) {
      investment.transactionReference = dto.transactionReference;
    }

    if (dto.equityPercentage !== undefined) {
      investment.equityPercentage = dto.equityPercentage;
    }

    if (dto.expectedReturns !== undefined) {
      investment.expectedReturns = dto.expectedReturns;
    }

    if (dto.actualReturns !== undefined) {
      investment.actualReturns = dto.actualReturns;
    }

    return this.investmentRepo.save(investment);
  }

  async cancel(id: string, userId: string): Promise<Investment> {
    const investment = await this.findById(id);

    // Only allow canceling own investments
    if (investment.investorId !== userId) {
      throw new ForbiddenException('You can only cancel your own investments');
    }

    if (investment.status !== InvestmentStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel investment with status: ${investment.status}. Only PENDING investments can be cancelled.`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update investment status
      investment.status = InvestmentStatus.CANCELLED;
      await queryRunner.manager.save(investment);

      // Create refund transaction
      const refundTransaction = this.transactionRepo.create({
        userId: investment.investorId,
        investmentId: investment.id,
        projectId: investment.projectId,
        type: TransactionType.REFUND,
        amount: investment.amount,
        currency: investment.currency,
        status: TransactionStatus.PENDING,
        paymentMethod: investment.paymentMethod,
        metadata: { reason: 'Investment cancelled by investor' },
      });
      await queryRunner.manager.save(refundTransaction);

      // Decrement project funding
      await queryRunner.manager.decrement(
        Project,
        { id: investment.projectId },
        'fundingRaised',
        investment.amount,
      );

      await queryRunner.commitTransaction();

      this.logger.log(`Investment cancelled: ${id}`);
      return investment;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to cancel investment: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async confirm(id: string): Promise<Investment> {
    const investment = await this.findById(id);

    if (investment.status !== InvestmentStatus.PENDING) {
      throw new BadRequestException(
        `Cannot confirm investment with status: ${investment.status}. Only PENDING investments can be confirmed.`,
      );
    }

    investment.status = InvestmentStatus.CONFIRMED;
    investment.confirmedAt = new Date();

    const saved = await this.investmentRepo.save(investment);

    // Update associated transaction
    await this.transactionRepo.update(
      { investmentId: id, type: TransactionType.INVESTMENT },
      { status: TransactionStatus.COMPLETED, processedAt: new Date() },
    );

    this.logger.log(`Investment confirmed: ${id}`);
    return saved;
  }

  // ───────────────────────────────────────────────
  // Portfolio Methods
  // ───────────────────────────────────────────────

  async getPortfolio(investorId: string): Promise<{
    active: Investment[];
    pending: Investment[];
    completed: Investment[];
    cancelled: Investment[];
  }> {
    const investments = await this.investmentRepo.find({
      where: { investorId },
      relations: ['project'],
      order: { investedAt: 'DESC' },
    });

    return {
      active: investments.filter((i) => i.status === InvestmentStatus.CONFIRMED),
      pending: investments.filter((i) => i.status === InvestmentStatus.PENDING),
      completed: investments.filter((i) => i.status === InvestmentStatus.CONFIRMED && i.actualReturns > 0),
      cancelled: investments.filter(
        (i) =>
          i.status === InvestmentStatus.CANCELLED ||
          i.status === InvestmentStatus.REFUNDED,
      ),
    };
  }

  async getPortfolioStats(investorId: string): Promise<PortfolioStatsDto> {
    const investments = await this.investmentRepo.find({
      where: { investorId },
    });

    let totalInvested = 0;
    let totalReturns = 0;
    let activeInvestments = 0;
    let completedInvestments = 0;
    let pendingInvestments = 0;
    let cancelledInvestments = 0;

    for (const inv of investments) {
      if (inv.status === InvestmentStatus.CONFIRMED) {
        totalInvested = this.addDecimals(totalInvested, inv.amount);
        totalReturns = this.addDecimals(totalReturns, inv.actualReturns);
        activeInvestments++;
        if (inv.actualReturns > 0) {
          completedInvestments++;
        }
      } else if (inv.status === InvestmentStatus.PENDING) {
        pendingInvestments++;
      } else if (
        inv.status === InvestmentStatus.CANCELLED ||
        inv.status === InvestmentStatus.REFUNDED
      ) {
        cancelledInvestments++;
      }
    }

    const netValue = this.addDecimals(totalInvested, totalReturns);
    const roiPercentage =
      totalInvested > 0
        ? this.roundDecimals((totalReturns / totalInvested) * 100, 2)
        : 0;

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

  async getPortfolioPerformance(
    investorId: string,
  ): Promise<PortfolioPerformanceDto> {
    const investments = await this.investmentRepo.find({
      where: { investorId },
      order: { investedAt: 'ASC' },
    });

    // Group by month
    const monthlyMap = new Map<string, MonthlyPerformanceDto>();

    for (const inv of investments) {
      const month = this.formatMonth(inv.investedAt);

      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, {
          month,
          amountInvested: 0,
          amountReturned: 0,
          netCashFlow: 0,
          investmentCount: 0,
        });
      }

      const data = monthlyMap.get(month)!;
      if (inv.status === InvestmentStatus.CONFIRMED) {
        data.amountInvested = this.addDecimals(data.amountInvested, inv.amount);
        data.investmentCount++;
      }
      data.amountReturned = this.addDecimals(data.amountReturned, inv.actualReturns);
      data.netCashFlow = this.addDecimals(data.amountReturned, -data.amountInvested);
    }

    // Also process returns that may come later
    const allMonths = Array.from(monthlyMap.keys()).sort();

    const monthlyData: MonthlyPerformanceDto[] = allMonths.map((month) => ({
      ...monthlyMap.get(month)!,
    }));

    // Calculate cumulative data
    let cumulativeInvested = 0;
    let cumulativeReturns = 0;

    const cumulativeInvestedData: { month: string; amount: number }[] = [];
    const cumulativeReturnsData: { month: string; amount: number }[] = [];

    for (const month of allMonths) {
      const data = monthlyMap.get(month)!;
      cumulativeInvested = this.addDecimals(cumulativeInvested, data.amountInvested);
      cumulativeReturns = this.addDecimals(cumulativeReturns, data.amountReturned);

      cumulativeInvestedData.push({ month, amount: cumulativeInvested });
      cumulativeReturnsData.push({ month, amount: cumulativeReturns });
    }

    return {
      monthlyData,
      cumulativeInvested: cumulativeInvestedData,
      cumulativeReturns: cumulativeReturnsData,
    };
  }

  // ───────────────────────────────────────────────
  // Admin Stats
  // ───────────────────────────────────────────────

  async getStats(): Promise<InvestmentStatsDto> {
    const investments = await this.investmentRepo.find({
      relations: ['project'],
    });

    let totalAmount = 0;
    let totalReturns = 0;
    const statusMap = new Map<string, { count: number; totalAmount: number }>();
    const sectorMap = new Map<string, { count: number; totalAmount: number }>();
    let pendingCount = 0;
    let confirmedCount = 0;

    for (const inv of investments) {
      totalAmount = this.addDecimals(totalAmount, inv.amount);
      totalReturns = this.addDecimals(totalReturns, inv.actualReturns);

      // By status
      const statusEntry = statusMap.get(inv.status) || { count: 0, totalAmount: 0 };
      statusEntry.count++;
      statusEntry.totalAmount = this.addDecimals(statusEntry.totalAmount, inv.amount);
      statusMap.set(inv.status, statusEntry);

      if (inv.status === InvestmentStatus.PENDING) pendingCount++;
      if (inv.status === InvestmentStatus.CONFIRMED) confirmedCount++;

      // By sector (from project)
      const sector = inv.project?.sector || 'UNKNOWN';
      const sectorEntry = sectorMap.get(sector) || { count: 0, totalAmount: 0 };
      sectorEntry.count++;
      sectorEntry.totalAmount = this.addDecimals(sectorEntry.totalAmount, inv.amount);
      sectorMap.set(sector, sectorEntry);
    }

    return {
      totalInvestments: investments.length,
      totalAmount,
      byStatus: Array.from(statusMap.entries()).map(([status, data]) => ({
        status,
        ...data,
      })),
      bySector: Array.from(sectorMap.entries()).map(([sector, data]) => ({
        sector,
        ...data,
      })),
      totalReturns,
      pendingCount,
      confirmedCount,
    };
  }

  // ───────────────────────────────────────────────
  // Transaction Methods
  // ───────────────────────────────────────────────

  async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    const transaction = this.transactionRepo.create({
      ...dto,
      status: dto.status || TransactionStatus.PENDING,
    });

    return this.transactionRepo.save(transaction);
  }

  async findTransactions(
    userId: string,
    filter: TransactionFilterDto,
  ): Promise<PaginatedResponse<Transaction>> {
    return this.queryTransactions({ ...filter, userId });
  }

  async findAllTransactions(
    filter: TransactionFilterDto,
  ): Promise<PaginatedResponse<Transaction>> {
    return this.queryTransactions(filter);
  }

  private async queryTransactions(
    filter: TransactionFilterDto & { userId?: string },
  ): Promise<PaginatedResponse<Transaction>> {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      startDate,
      endDate,
      userId,
      investmentId,
      projectId,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const skip = (page - 1) * limit;

    const query = this.transactionRepo.createQueryBuilder('transaction');

    if (userId) {
      query.where('transaction.userId = :userId', { userId });
    }

    if (type) {
      query.andWhere('transaction.type = :type', { type });
    }

    if (status) {
      query.andWhere('transaction.status = :status', { status });
    }

    if (startDate && endDate) {
      query.andWhere('transaction.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      query.andWhere('transaction.createdAt >= :startDate', { startDate });
    } else if (endDate) {
      query.andWhere('transaction.createdAt <= :endDate', { endDate });
    }

    if (investmentId) {
      query.andWhere('transaction.investmentId = :investmentId', { investmentId });
    }

    if (projectId) {
      query.andWhere('transaction.projectId = :projectId', { projectId });
    }

    if (minAmount !== undefined) {
      query.andWhere('transaction.amount >= :minAmount', { minAmount });
    }

    if (maxAmount !== undefined) {
      query.andWhere('transaction.amount <= :maxAmount', { maxAmount });
    }

    if (filter.maxRiskScore !== undefined) {
      query.andWhere('transaction.riskScore <= :maxRiskScore', { maxRiskScore: filter.maxRiskScore });
    }

    if (filter.jurisdiction) {
      query.andWhere('transaction.jurisdiction = :jurisdiction', { jurisdiction: filter.jurisdiction });
    }

    query.orderBy(`transaction.${sortBy}`, sortOrder);

    const [data, total] = await query.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  async findTransactionById(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async deposit(userId: string, dto: DepositDto): Promise<Transaction> {
    const transaction = this.transactionRepo.create({
      userId,
      type: TransactionType.DEPOSIT,
      amount: dto.amount,
      currency: dto.currency || 'USD',
      status: TransactionStatus.PENDING,
      paymentMethod: dto.paymentMethod,
      paymentProvider: dto.paymentProvider,
    });

    return this.transactionRepo.save(transaction);
  }

  async withdraw(userId: string, dto: WithdrawalDto): Promise<Transaction> {
    const transaction = this.transactionRepo.create({
      userId,
      type: TransactionType.WITHDRAWAL,
      amount: dto.amount,
      currency: dto.currency || 'USD',
      status: TransactionStatus.PENDING,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      metadata: {
        bankDetails: dto.bankDetails,
        note: dto.note,
      },
    });

    return this.transactionRepo.save(transaction);
  }

  async processTransaction(id: string): Promise<Transaction> {
    const transaction = await this.findTransactionById(id);

    if (transaction.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(
        `Cannot process transaction with status: ${transaction.status}. Only PENDING transactions can be processed.`,
      );
    }

    transaction.status = TransactionStatus.COMPLETED;
    transaction.processedAt = new Date();

    return this.transactionRepo.save(transaction);
  }

  async approveTransaction(id: string): Promise<Transaction> {
    const transaction = await this.findTransactionById(id);
    if (transaction.status !== TransactionStatus.PENDING) {
      throw new BadRequestException('Only pending transactions can be approved');
    }
    transaction.status = TransactionStatus.COMPLETED;
    transaction.processedAt = new Date();
    return this.transactionRepo.save(transaction);
  }

  async holdTransaction(id: string): Promise<Transaction> {
    const transaction = await this.findTransactionById(id);
    if (transaction.status !== TransactionStatus.PENDING && transaction.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('Only pending or completed transactions can be held');
    }
    transaction.status = TransactionStatus.PENDING;
    transaction.processedAt = undefined as any;
    return this.transactionRepo.save(transaction);
  }

  async escalateTransaction(id: string, notes?: string): Promise<Transaction> {
    const transaction = await this.findTransactionById(id);
    transaction.metadata = { ...(transaction.metadata || {}), escalated: true, escalationNotes: notes, escalatedAt: new Date().toISOString() };
    return this.transactionRepo.save(transaction);
  }

  async reverseTransaction(id: string, reason?: string): Promise<Transaction> {
    const transaction = await this.findTransactionById(id);
    if (transaction.status === TransactionStatus.CANCELLED) {
      throw new BadRequestException('Transaction is already cancelled');
    }
    transaction.status = TransactionStatus.CANCELLED;
    transaction.metadata = { ...(transaction.metadata || {}), reversed: true, reversalReason: reason, reversedAt: new Date().toISOString() };
    return this.transactionRepo.save(transaction);
  }

  async findRelatedTransactions(projectId: string, excludeId: string): Promise<Transaction[]> {
    return this.transactionRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    }).then(txs => txs.filter(t => t.id !== excludeId));
  }

  async getTransactionStats(): Promise<TransactionStatsDto> {
    const transactions = await this.transactionRepo.find();

    let totalVolume = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalFees = 0;

    const typeMap = new Map<string, { count: number; totalAmount: number }>();
    const statusMap = new Map<string, { count: number; totalAmount: number }>();

    for (const tx of transactions) {
      totalVolume = this.addDecimals(totalVolume, tx.amount);

      // By type
      const typeEntry = typeMap.get(tx.type) || { count: 0, totalAmount: 0 };
      typeEntry.count++;
      typeEntry.totalAmount = this.addDecimals(typeEntry.totalAmount, tx.amount);
      typeMap.set(tx.type, typeEntry);

      // By status
      const statusEntry = statusMap.get(tx.status) || { count: 0, totalAmount: 0 };
      statusEntry.count++;
      statusEntry.totalAmount = this.addDecimals(statusEntry.totalAmount, tx.amount);
      statusMap.set(tx.status, statusEntry);

      if (tx.type === TransactionType.DEPOSIT) {
        totalDeposits = this.addDecimals(totalDeposits, tx.amount);
      }
      if (tx.type === TransactionType.WITHDRAWAL) {
        totalWithdrawals = this.addDecimals(totalWithdrawals, tx.amount);
      }
      if (tx.type === TransactionType.FEE) {
        totalFees = this.addDecimals(totalFees, tx.amount);
      }
    }

    return {
      totalTransactions: transactions.length,
      totalVolume,
      byType: Array.from(typeMap.entries()).map(([type, data]) => ({
        type,
        ...data,
      })),
      byStatus: Array.from(statusMap.entries()).map(([status, data]) => ({
        status,
        ...data,
      })),
      totalDeposits,
      totalWithdrawals,
      totalFees,
    };
  }

  // ───────────────────────────────────────────────
  // Decimal Helpers
  // ───────────────────────────────────────────────

  private addDecimals(a: number, b: number): number {
    return this.roundDecimals(a + b, 2);
  }

  private roundDecimals(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private formatMonth(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}
