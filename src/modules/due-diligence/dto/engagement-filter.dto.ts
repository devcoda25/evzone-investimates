import { IsOptional, IsEnum, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@common/dto/pagination.dto';
import { DueDiligenceStatus } from '@common/enums';

export class EngagementFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: DueDiligenceStatus, description: 'Filter by engagement status' })
  @IsOptional()
  @IsEnum(DueDiligenceStatus)
  status?: DueDiligenceStatus;

  @ApiPropertyOptional({ description: 'Filter by provider ID' })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({ description: 'Filter by project ID' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
