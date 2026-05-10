import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { SendEmailDto } from './dto/send-email.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('email')
  @Roles(UserRole.ADMIN)
  async sendEmail(@Body() sendEmailDto: SendEmailDto) {
    await this.messagingService.sendEmail(sendEmailDto);
    return { success: true, message: 'Email sent successfully' };
  }

  @Post('sms')
  @Roles(UserRole.ADMIN)
  async sendSms(@Body() sendSmsDto: SendSmsDto) {
    await this.messagingService.sendSms(sendSmsDto);
    return { success: true, message: 'SMS sent successfully' };
  }
}
