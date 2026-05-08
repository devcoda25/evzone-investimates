import {
  IsString, IsOptional, IsNumber, IsEnum, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MilestoneStatus } from '@common/enums';

export class CreateMilestoneDto {
  @ApiProperty({ example: 'Site Acquisition & Permits' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional({ enum: MilestoneStatus })
  @IsOptional()
  @IsEnum(MilestoneStatus)
  status?: MilestoneStatus;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  deliverables?: Record<string, any>;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  fundingTranche?: number;

  @ApiProperty({ example: '2025-12-31' })
  @IsDateString()
  dueDate: string;
}
