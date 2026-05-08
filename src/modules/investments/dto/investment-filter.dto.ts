import { IsOptional, IsEnum, IsString, IsUUID, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvestmentStatus } from '@common/enums';
import { PaginationDto } from '@common/dto/pagination.dto';

export class InvestmentFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: InvestmentStatus, description: 'Filter by investment status' })
  @IsOptional()
  @IsEnum(InvestmentStatus)
  status?: InvestmentStatus;

  @ApiPropertyOptional({ description: 'Filter by project ID' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Filter by start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by end date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Minimum investment amount' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  minAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum investment amount' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  maxAmount?: number;

  @ApiPropertyOptional({ description: 'Search term (project title, reference)' })
  @IsOptional()
  @IsString()
  search?: string;
}
