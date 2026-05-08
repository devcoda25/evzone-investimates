import { IsNotEmpty, IsNumber, IsPositive, IsOptional, IsString, Min, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BankDetailsDto {
  @ApiProperty({ description: 'Bank name' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  bankName: string;

  @ApiProperty({ description: 'Account holder name' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  accountHolderName: string;

  @ApiProperty({ description: 'Account number' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  accountNumber: string;

  @ApiPropertyOptional({ description: 'Routing number / SWIFT code' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  routingNumber?: string;

  @ApiPropertyOptional({ description: 'IBAN for international transfers' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  iban?: string;

  @ApiPropertyOptional({ description: 'Country of bank' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

export class WithdrawalDto {
  @ApiProperty({ description: 'Withdrawal amount', example: 5000.00 })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(1)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string = 'USD';

  @ApiProperty({ description: 'Bank account details for withdrawal' })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bankDetails: BankDetailsDto;

  @ApiPropertyOptional({ description: 'Withdrawal reason or note' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
