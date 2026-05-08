import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MessagingService } from './messaging.service';
import { EmailService } from './providers/email.service';
import { SmsService } from './providers/sms.service';
import { SendGridProvider } from './providers/sendgrid.provider';
import { ZohoProvider } from './providers/zoho.provider';
import { SubmailEmailProvider } from './providers/submail-email.provider';
import { TwilioProvider } from './providers/twilio.provider';
import { AfricasTalkingProvider } from './providers/africas-talking.provider';
import { SubmailSmsProvider } from './providers/submail-sms.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MessagingService,
    EmailService,
    SmsService,
    // Email Providers
    SendGridProvider,
    ZohoProvider,
    SubmailEmailProvider,
    // SMS Providers
    TwilioProvider,
    AfricasTalkingProvider,
    SubmailSmsProvider,
  ],
  exports: [MessagingService, EmailService, SmsService],
})
export class MessagingModule {}
