import { IsOptional, IsNumber, IsString, IsEnum, Min, Max, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ComplianceAlertSeverity as RiskLevel } from '@common/enums';

export class ReportDocumentDto {
  @IsString()
  name: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  type?: string;
}

export class SubmitReportDto {
  @ApiPropertyOptional({ description: 'Financial assessment (JSONB)', type: 'object' })
  @IsOptional()
  financialAssessment?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Technical assessment (JSONB)', type: 'object' })
  @IsOptional()
  technicalAssessment?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Legal assessment (JSONB)', type: 'object' })
  @IsOptional()
  legalAssessment?: Record<string, any>;

  @ApiPropertyOptional({ description: 'ESG assessment (JSONB)', type: 'object' })
  @IsOptional()
  esgAssessment?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Market assessment (JSONB)', type: 'object' })
  @IsOptional()
  marketAssessment?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Overall score (0-100)', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  overallScore?: number;

  @ApiPropertyOptional({ enum: RiskLevel, description: 'Risk level assessment' })
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Report documents', type: [ReportDocumentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportDocumentDto)
  reportDocuments?: ReportDocumentDto[];
}
