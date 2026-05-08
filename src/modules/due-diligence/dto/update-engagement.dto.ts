import { IsOptional, IsString, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DueDiligenceStatus } from '@common/enums';

export class AssessmentDataDto {
  @IsOptional()
  score?: number;

  @IsOptional()
  @IsString()
  rating?: string;

  @IsOptional()
  findings?: Record<string, any>;
}

export class UpdateEngagementDto {
  @ApiPropertyOptional({ enum: DueDiligenceStatus, description: 'Engagement status' })
  @IsOptional()
  @IsEnum(DueDiligenceStatus)
  status?: DueDiligenceStatus;

  @ApiPropertyOptional({ description: 'Notes for the engagement' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Financial assessment data (JSONB)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentDataDto)
  financialAssessment?: AssessmentDataDto;

  @ApiPropertyOptional({ description: 'Technical assessment data (JSONB)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentDataDto)
  technicalAssessment?: AssessmentDataDto;

  @ApiPropertyOptional({ description: 'Legal assessment data (JSONB)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentDataDto)
  legalAssessment?: AssessmentDataDto;

  @ApiPropertyOptional({ description: 'ESG assessment data (JSONB)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentDataDto)
  esgAssessment?: AssessmentDataDto;

  @ApiPropertyOptional({ description: 'Market assessment data (JSONB)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentDataDto)
  marketAssessment?: AssessmentDataDto;
}
