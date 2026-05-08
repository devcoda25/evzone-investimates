import { IsNotEmpty, IsNumber, IsPositive, IsEnum, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@common/enums';

export class DepositDto {
  @ApiProperty({ description: 'Deposit amount', example: 10000.00 })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(1)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ enum: PaymentMethod, description: 'Payment method for deposit' })
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string = 'USD';

  @ApiPropertyOptional({ description: 'Payment provider (e.g., stripe, flutterwave)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentProvider?: string;
}
