import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InvestmentsService } from './investments.service';
import { OidcAuthGuard } from '@common/guards/oidc-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles, UserRole } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import {
  CreateInvestmentDto,
  UpdateInvestmentDto,
  InvestmentFilterDto,
  TransactionFilterDto,
  DepositDto,
  WithdrawalDto,
} from './dto';

@ApiTags('Investments')
@ApiBearerAuth()
@UseGuards(OidcAuthGuard, RolesGuard)
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  // ───────────────────────────────────────────────
  // Portfolio Endpoints -- must be BEFORE /:id routes
  // ───────────────────────────────────────────────

  @Get('portfolio')
  @Roles(UserRole.INVESTOR)
  @ApiOperation({ summary: 'Get portfolio dashboard' })
  @ApiResponse({ status: 200, description: 'Portfolio data grouped by status' })
  async getPortfolio(
    @CurrentUser('id') investorId: string,
  ) {
    return this.investmentsService.getPortfolio(investorId);
  }

  @Get('portfolio/stats')
  @Roles(UserRole.INVESTOR)
  @ApiOperation({ summary: 'Get portfolio statistics' })
  @ApiResponse({ status: 200, description: 'Portfolio aggregated statistics' })
  async getPortfolioStats(
    @CurrentUser('id') investorId: string,
  ) {
    return this.investmentsService.getPortfolioStats(investorId);
  }

  @Get('portfolio/performance')
  @Roles(UserRole.INVESTOR)
  @ApiOperation({ summary: 'Get portfolio performance over time' })
  @ApiResponse({ status: 200, description: 'Monthly performance data for charts' })
  async getPortfolioPerformance(
    @CurrentUser('id') investorId: string,
  ) {
    return this.investmentsService.getPortfolioPerformance(investorId);
  }

  // ───────────────────────────────────────────────
  // Project Investments -- must be BEFORE /:id routes
  // ───────────────────────────────────────────────

  @Get('project/:projectId')
  @Roles(UserRole.ENTREPRENEUR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get investments for a project' })
  @ApiResponse({ status: 200, description: 'List of project investments' })
  async findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
    @Query() filter: InvestmentFilterDto,
  ) {
    // TODO: Verify entrepreneur owns the project
    // For now, admin bypasses; entrepreneur checks done at service or guard level
    return this.investmentsService.findByProject(projectId, filter);
  }

  // ───────────────────────────────────────────────
  // Investment CRUD Endpoints
  // ───────────────────────────────────────────────

  @Post()
  @Roles(UserRole.INVESTOR)
  @ApiOperation({ summary: 'Make an investment in a project' })
  @ApiResponse({ status: 201, description: 'Investment created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid investment data or project not open' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async invest(
    @CurrentUser('id') investorId: string,
    @Body('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateInvestmentDto,
  ) {
    return this.investmentsService.invest(investorId, projectId, dto);
  }

  @Get()
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List my investments (or all for admin)' })
  @ApiResponse({ status: 200, description: 'List of investments' })
  async findByInvestor(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
    @Query() filter: InvestmentFilterDto,
  ) {
    // Admin can see all; investors see their own
    if (userRole === UserRole.ADMIN) {
      return this.investmentsService.findAllInvestments(filter);
    }
    return this.investmentsService.findByInvestor(userId, filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get investment details by ID' })
  @ApiResponse({ status: 200, description: 'Investment details' })
  @ApiResponse({ status: 404, description: 'Investment not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    const investment = await this.investmentsService.findById(id);

    // Only own investment or admin
    if (investment.investorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only view your own investments');
    }

    return investment;
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update investment (admin only)' })
  @ApiResponse({ status: 200, description: 'Investment updated' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvestmentDto,
  ) {
    return this.investmentsService.update(id, dto);
  }

  @Post(':id/cancel')
  @Roles(UserRole.INVESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending investment' })
  @ApiResponse({ status: 200, description: 'Investment cancelled' })
  @ApiResponse({ status: 400, description: 'Investment is not pending' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.investmentsService.cancel(id, userId);
  }

  @Post(':id/confirm')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an investment (admin only)' })
  @ApiResponse({ status: 200, description: 'Investment confirmed' })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.investmentsService.confirm(id);
  }
}

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(OidcAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  // ───────────────────────────────────────────────
  // Stats -- must be BEFORE /:id routes
  // ───────────────────────────────────────────────

  @Get('stats')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get transaction statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Transaction statistics' })
  async getTransactionStats() {
    return this.investmentsService.getTransactionStats();
  }

  // ───────────────────────────────────────────────
  // Transaction CRUD
  // ───────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List transactions' })
  @ApiResponse({ status: 200, description: 'List of transactions' })
  async findTransactions(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
    @Query() filter: TransactionFilterDto,
  ) {
    if (userRole === UserRole.ADMIN) {
      return this.investmentsService.findAllTransactions(filter);
    }
    return this.investmentsService.findTransactions(userId, filter);
  }

  @Get(':id/related')
  @ApiOperation({ summary: 'Get related transactions by project' })
  @ApiResponse({ status: 200, description: 'Related transactions returned' })
  async findRelatedTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    const transaction = await this.investmentsService.findTransactionById(id);
    if (transaction.userId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only view your own transactions');
    }
    return this.investmentsService.findRelatedTransactions(transaction.projectId, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findTransactionById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    const transaction = await this.investmentsService.findTransactionById(id);

    if (transaction.userId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only view your own transactions');
    }

    return transaction;
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Create a deposit' })
  @ApiResponse({ status: 201, description: 'Deposit transaction created' })
  async deposit(
    @CurrentUser('id') userId: string,
    @Body() dto: DepositDto,
  ) {
    return this.investmentsService.deposit(userId, dto);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Request a withdrawal' })
  @ApiResponse({ status: 201, description: 'Withdrawal transaction created' })
  async withdraw(
    @CurrentUser('id') userId: string,
    @Body() dto: WithdrawalDto,
  ) {
    return this.investmentsService.withdraw(userId, dto);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending transaction (admin only)' })
  @ApiResponse({ status: 200, description: 'Transaction approved' })
  async approveTransaction(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.investmentsService.approveTransaction(id);
  }

  @Post(':id/hold')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hold a transaction (admin only)' })
  @ApiResponse({ status: 200, description: 'Transaction held' })
  async holdTransaction(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.investmentsService.holdTransaction(id);
  }

  @Post(':id/escalate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Escalate a transaction (admin only)' })
  @ApiResponse({ status: 200, description: 'Transaction escalated' })
  async escalateTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes?: string,
  ) {
    return this.investmentsService.escalateTransaction(id, notes);
  }

  @Post(':id/reverse')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse a transaction (admin only)' })
  @ApiResponse({ status: 200, description: 'Transaction reversed' })
  async reverseTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.investmentsService.reverseTransaction(id, reason);
  }

  @Post(':id/process')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process a pending transaction (admin only)' })
  @ApiResponse({ status: 200, description: 'Transaction processed' })
  async processTransaction(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.investmentsService.processTransaction(id);
  }
}
