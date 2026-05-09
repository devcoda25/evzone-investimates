import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@common/enums';

export class SendNotificationToUserDto {
  @ApiProperty({ description: 'Target user ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

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