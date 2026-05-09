import { IsUUID, IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEngagementDto {
  @ApiProperty({ description: 'Project ID to assign for due diligence' })
  @IsUUID()
  projectId: string;

  @ApiProperty({ description: 'Assessor user ID to assign the engagement to' })
  @IsUUID()
  assessorId: string;

  @ApiProperty({ description: 'Due date for the engagement' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ description: 'Optional notes for the engagement' })
  @IsOptional()
  @IsString()
  notes?: string;
}
