import { IsOptional, IsEnum, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvestmentStatus } from '@common/enums';

export class UpdateInvestmentDto {
  @ApiPropertyOptional({ enum: InvestmentStatus, description: 'Investment status (admin only)' })
  @IsOptional()
  @IsEnum(InvestmentStatus)
  status?: InvestmentStatus;

  @ApiPropertyOptional({ description: 'Transaction reference' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  transactionReference?: string;

  @ApiPropertyOptional({ description: 'Equity percentage received' })
  @IsOptional()
  equityPercentage?: number;

  @ApiPropertyOptional({ description: 'Expected returns amount' })
  @IsOptional()
  expectedReturns?: number;

  @ApiPropertyOptional({ description: 'Actual returns amount' })
  @IsOptional()
  actualReturns?: number;
}
