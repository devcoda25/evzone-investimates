import {
  IsString, IsOptional, IsNumber, IsEnum, IsArray, Min, Max,
  IsDateString, IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectSector, ProjectStage } from '@common/enums';

export class CreateProjectDto {
  @ApiProperty({ example: 'Solar Microgrid for Rural Kenya' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Bringing clean energy to 10,000 households' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiProperty({ example: 'A community-owned solar microgrid project...' })
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  longDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  coverImage?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  galleryImages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @ApiProperty({ example: 500000 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  fundingGoal: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  minInvestment?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  maxInvestment?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 15.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  equityOffered?: number;

  @ApiProperty({ example: 'Kenya' })
  @IsString()
  country: string;

  @ApiPropertyOptional({ example: 'Nairobi' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Central' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ enum: ProjectSector })
  @IsEnum(ProjectSector)
  sector: ProjectSector;

  @ApiProperty({ enum: ProjectStage })
  @IsEnum(ProjectStage)
  stage: ProjectStage;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  impactMetrics?: Record<string, any>;

  @ApiPropertyOptional({ type: [Number], example: [7, 13] })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  sdgs?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  campaignStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  campaignEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  projectStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  projectEndDate?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  teamMembers?: Record<string, any>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  risks?: Record<string, any>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  faqs?: Record<string, any>;
}
