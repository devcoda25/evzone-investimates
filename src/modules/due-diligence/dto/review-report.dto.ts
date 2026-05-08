import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DueDiligenceStatus } from '@common/enums';

export class ReviewReportDto {
  @ApiProperty({ enum: [DueDiligenceStatus.COMPLETED, DueDiligenceStatus.REJECTED], description: 'Review decision' })
  @IsEnum(DueDiligenceStatus)
  status: DueDiligenceStatus.COMPLETED | DueDiligenceStatus.REJECTED;

  @ApiPropertyOptional({ description: 'Review notes or feedback' })
  @IsOptional()
  @IsString()
  notes?: string;
}
