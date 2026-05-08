import { IsNotEmpty, IsNumber, IsPositive, IsEnum, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@common/enums';

export class CreateInvestmentDto {
  @ApiProperty({ description: 'Investment amount', example: 5000.00 })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(1)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ enum: PaymentMethod, description: 'Payment method' })
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD', example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string = 'USD';
}
