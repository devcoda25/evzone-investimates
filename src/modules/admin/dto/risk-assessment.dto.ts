import { IsEnum, IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplianceAlertSeverity } from '@common/enums';

export class RiskAssessmentDto {
  @ApiProperty({ enum: ComplianceAlertSeverity, description: 'Risk level assessment' })
  @IsEnum(ComplianceAlertSeverity)
  riskLevel: ComplianceAlertSeverity;

  @ApiPropertyOptional({ description: 'Risk factors identified', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  factors?: string[];

  @ApiPropertyOptional({ description: 'Mitigation plan' })
  @IsOptional()
  @IsString()
  mitigationPlan?: string;
}
