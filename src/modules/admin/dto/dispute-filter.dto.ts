import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeType, DisputeStatus } from '@common/enums';
import { PaginationDto } from '@common/dto/pagination.dto';

export class DisputeFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: DisputeType })
  @IsOptional()
  @IsEnum(DisputeType)
  type?: DisputeType;

  @ApiPropertyOptional({ enum: DisputeStatus })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;
}
