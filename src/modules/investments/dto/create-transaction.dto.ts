import { IsNotEmpty, IsEnum, IsNumber, IsPositive, IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType, TransactionStatus, PaymentMethod } from '@common/enums';

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType, description: 'Transaction type' })
  @IsNotEmpty()
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ description: 'Transaction amount', example: 1000.00 })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string = 'USD';

  @ApiProperty({ enum: PaymentMethod, description: 'Payment method' })
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ enum: TransactionStatus, description: 'Transaction status', default: TransactionStatus.PENDING })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus = TransactionStatus.PENDING;

  @ApiPropertyOptional({ description: 'Associated user ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Associated investment ID' })
  @IsOptional()
  @IsUUID()
  investmentId?: string;

  @ApiPropertyOptional({ description: 'Associated project ID' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Payment provider name' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentProvider?: string;

  @ApiPropertyOptional({ description: 'Provider transaction ID' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerTransactionId?: string;

  @ApiPropertyOptional({ description: 'From party name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromParty?: string;

  @ApiPropertyOptional({ description: 'To party name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  toParty?: string;

  @ApiPropertyOptional({ description: 'Risk score (0-100)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  riskScore?: number;

  @ApiPropertyOptional({ description: 'Jurisdiction' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jurisdiction?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
