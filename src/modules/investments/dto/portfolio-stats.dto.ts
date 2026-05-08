import { ApiProperty } from '@nestjs/swagger';

export class PortfolioStatsDto {
  @ApiProperty({ description: 'Total amount invested across all investments' })
  totalInvested: number;

  @ApiProperty({ description: 'Total returns received' })
  totalReturns: number;

  @ApiProperty({ description: 'Net portfolio value (invested + returns)' })
  netValue: number;

  @ApiProperty({ description: 'Return on investment percentage' })
  roiPercentage: number;

  @ApiProperty({ description: 'Number of active investments' })
  activeInvestments: number;

  @ApiProperty({ description: 'Number of completed investments' })
  completedInvestments: number;

  @ApiProperty({ description: 'Number of pending investments' })
  pendingInvestments: number;

  @ApiProperty({ description: 'Number of cancelled/refunded investments' })
  cancelledInvestments: number;

  @ApiProperty({ description: 'Total number of investments' })
  totalInvestments: number;
}

export class MonthlyPerformanceDto {
  @ApiProperty({ description: 'Month in YYYY-MM format' })
  month: string;

  @ApiProperty({ description: 'Total amount invested in this month' })
  amountInvested: number;

  @ApiProperty({ description: 'Total returns received in this month' })
  amountReturned: number;

  @ApiProperty({ description: 'Net cash flow for this month' })
  netCashFlow: number;

  @ApiProperty({ description: 'Number of investments made' })
  investmentCount: number;
}

export class PortfolioPerformanceDto {
  @ApiProperty({ description: 'Monthly performance data points', type: [MonthlyPerformanceDto] })
  monthlyData: MonthlyPerformanceDto[];

  @ApiProperty({ description: 'Cumulative investment over time' })
  cumulativeInvested: { month: string; amount: number }[];

  @ApiProperty({ description: 'Cumulative returns over time' })
  cumulativeReturns: { month: string; amount: number }[];
}

export class InvestmentStatsDto {
  @ApiProperty({ description: 'Total number of investments across all users' })
  totalInvestments: number;

  @ApiProperty({ description: 'Total amount invested across all users' })
  totalAmount: number;

  @ApiProperty({ description: 'Investments grouped by status' })
  byStatus: { status: string; count: number; totalAmount: number }[];

  @ApiProperty({ description: 'Investments grouped by sector' })
  bySector: { sector: string; count: number; totalAmount: number }[];

  @ApiProperty({ description: 'Total returns distributed' })
  totalReturns: number;

  @ApiProperty({ description: 'Total pending investments' })
  pendingCount: number;

  @ApiProperty({ description: 'Total confirmed investments' })
  confirmedCount: number;
}

export class TransactionStatsDto {
  @ApiProperty({ description: 'Total number of transactions' })
  totalTransactions: number;

  @ApiProperty({ description: 'Total transaction volume' })
  totalVolume: number;

  @ApiProperty({ description: 'Transactions grouped by type' })
  byType: { type: string; count: number; totalAmount: number }[];

  @ApiProperty({ description: 'Transactions grouped by status' })
  byStatus: { status: string; count: number; totalAmount: number }[];

  @ApiProperty({ description: 'Total deposits' })
  totalDeposits: number;

  @ApiProperty({ description: 'Total withdrawals' })
  totalWithdrawals: number;

  @ApiProperty({ description: 'Total fees collected' })
  totalFees: number;
}
