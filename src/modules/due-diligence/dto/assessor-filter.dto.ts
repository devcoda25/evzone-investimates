import { IsOptional, IsEnum, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@common/dto/pagination.dto';
import { AssessorAvailability } from '@common/enums';

export class AssessorFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AssessorAvailability, description: 'Filter by availability status' })
  @IsOptional()
  @IsEnum(AssessorAvailability)
  availability?: AssessorAvailability;

  @ApiPropertyOptional({ description: 'Filter by specialty (comma-separated or single)' })
  @IsOptional()
  @IsString()
  specialties?: string;

  @ApiPropertyOptional({ description: 'Minimum rating (0-5)', minimum: 0, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  rating?: number;
}
