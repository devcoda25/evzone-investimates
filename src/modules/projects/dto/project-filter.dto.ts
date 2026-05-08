import { IsOptional, IsEnum, IsString, IsUUID, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@common/dto/pagination.dto';
import { ProjectStatus, ProjectSector, ProjectStage } from '@common/enums';

export class ProjectFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional({ enum: ProjectSector })
  @IsOptional()
  @IsEnum(ProjectSector)
  sector?: ProjectSector;

  @ApiPropertyOptional({ enum: ProjectStage })
  @IsOptional()
  @IsEnum(ProjectStage)
  stage?: ProjectStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entrepreneurId?: string;

  @ApiPropertyOptional({ description: 'Filter by mine (entrepreneur only)' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  mine?: boolean;

  @ApiPropertyOptional({ description: 'Include featured projects first' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  featured?: boolean;
}
