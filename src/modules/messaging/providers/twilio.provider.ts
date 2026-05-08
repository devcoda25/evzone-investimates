import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

export interface TwilioSmsOptions {
  to: string;
  message: string;
  from?: string;
}

@Injectable()
export class TwilioProvider {
  private readonly logger = new Logger(TwilioProvider.name);
  private readonly client: Twilio | null = null;
  private readonly fromNumber: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_FROM') || '';
    
    this.enabled = !!(accountSid && authToken && this.fromNumber);

    if (this.enabled) {
      this.client = new Twilio(accountSid, authToken);
    } else {
      this.logger.warn('Twilio provider disabled: credentials not configured');
    }
  }

  async send(options: TwilioSmsOptions): Promise<void> {
    if (!this.enabled || !this.client) {
      this.logger.debug(`[DEV] Would send Twilio SMS to ${options.to}: ${options.message}`);
      return;
    }

    await this.client.messages.create({
      body: options.message,
      from: options.from || this.fromNumber,
      to: options.to,
    });

    this.logger.log(`Twilio SMS sent to ${options.to}`);
  }
}