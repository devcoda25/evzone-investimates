import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AfricasTalkingSmsOptions {
  to: string;
  message: string;
  from?: string;
}

@Injectable()
export class AfricasTalkingProvider {
  private readonly logger = new Logger(AfricasTalkingProvider.name);
  private readonly username: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;
  private readonly baseUrl = 'https://api.africastalking.com/version1/messaging';

  constructor(private readonly configService: ConfigService) {
    this.username = this.configService.get<string>('AFRICASTALKING_USERNAME') || '';
    this.apiKey = this.configService.get<string>('AFRICASTALKING_API_KEY') || '';
    this.enabled = !!(this.username && this.apiKey);

    if (!this.enabled) {
      this.logger.warn('Africa\'s Talking provider disabled: credentials not configured');
    }
  }

  async send(options: AfricasTalkingSmsOptions): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`[DEV] Would send Africa's Talking SMS to ${options.to}: ${options.message}`);
      return;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'ApiKey': this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: this.username,
        to: options.to,
        message: options.message,
        from: options.from || '',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Africa's Talking SMS failed: ${error}`);
      throw new Error(`Africa's Talking SMS failed: ${error}`);
    }

    this.logger.log(`Africa's Talking SMS sent to ${options.to}`);
  }
}