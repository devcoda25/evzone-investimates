import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplianceAlertStatus } from '@common/enums';

export class ResolveAlertDto {
  @ApiProperty({ enum: ComplianceAlertStatus })
  @IsEnum(ComplianceAlertStatus)
  status: ComplianceAlertStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}
