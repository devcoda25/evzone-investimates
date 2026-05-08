import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ComplianceAlertType, ComplianceAlertSeverity, ComplianceAlertStatus } from '@common/enums';
import { PaginationDto } from '@common/dto/pagination.dto';

export class AlertFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ComplianceAlertType })
  @IsOptional()
  @IsEnum(ComplianceAlertType)
  type?: ComplianceAlertType;

  @ApiPropertyOptional({ enum: ComplianceAlertSeverity })
  @IsOptional()
  @IsEnum(ComplianceAlertSeverity)
  severity?: ComplianceAlertSeverity;

  @ApiPropertyOptional({ enum: ComplianceAlertStatus })
  @IsOptional()
  @IsEnum(ComplianceAlertStatus)
  status?: ComplianceAlertStatus;
}
