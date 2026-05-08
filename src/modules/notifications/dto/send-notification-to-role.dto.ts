import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@common/decorators/roles.decorator';

export class SendNotificationToRoleDto {
  @ApiProperty({ enum: UserRole, description: 'Target user role' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Notification message body' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ description: 'Optional JSON payload' })
  @IsOptional()
  @IsString()
  data?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Optional action URL' })
  @IsOptional()
  @IsString()
  actionUrl?: string;
}