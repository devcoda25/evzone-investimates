import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwilioProvider } from './twilio.provider';
import { AfricasTalkingProvider } from './africas-talking.provider';
import { SubmailSmsProvider } from './submail-sms.provider';

export interface SmsOptions {
  to: string;
  message: string;
  from?: string;
  region?: 'global' | 'china';
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly twilio: TwilioProvider,
    private readonly africasTalking: AfricasTalkingProvider,
    private readonly submail: SubmailSmsProvider,
  ) {}

  /**
   * Send SMS using the appropriate provider based on region
   * - Global: Twilio (default) or Africa's Talking
   * - China: Submail
   */
  async send(options: SmsOptions): Promise<void> {
    const region = options.region || 'global';

    try {
      if (region === 'china') {
        // Use Submail for China
        await this.submail.send(options);
      } else {
        // Use Twilio (default) for global
        await this.twilio.send(options);
      }
      this.logger.log(`SMS sent successfully to ${options.to}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Send SMS via Twilio (global default)
   */
  async sendViaTwilio(options: SmsOptions): Promise<void> {
    await this.twilio.send(options);
  }

  /**
   * Send SMS via Africa's Talking
   */
  async sendViaAfricasTalking(options: SmsOptions): Promise<void> {
    await this.africasTalking.send(options);
  }

  /**
   * Send SMS via Submail (China)
   */
  async sendViaSubmail(options: SmsOptions): Promise<void> {
    await this.submail.send(options);
  }
}