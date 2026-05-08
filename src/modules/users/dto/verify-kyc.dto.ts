import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KycStatus } from '@common/enums';

export class VerifyKycDto {
  @ApiProperty({
    enum: KycStatus,
    example: KycStatus.VERIFIED,
    description: 'KYC verification status to set',
  })
  @IsEnum(KycStatus)
  status: KycStatus;

  @ApiPropertyOptional({
    example: 'Documents verified successfully. All checks passed.',
    description: 'Optional notes from the admin reviewing the KYC submission',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
