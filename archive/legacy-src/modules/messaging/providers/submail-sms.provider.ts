import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SubmailSmsOptions {
  to: string;
  message: string;
  from?: string;
}

@Injectable()
export class SubmailSmsProvider {
  private readonly logger = new Logger(SubmailSmsProvider.name);
  private readonly appId: string;
  private readonly appKey: string;
  private readonly enabled: boolean;
  private readonly baseUrl = 'https://api.mysubmail.com/sms/send.json';

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('SUBMAIL_SMS_APP_ID') || '';
    this.appKey = this.configService.get<string>('SUBMAIL_SMS_APP_KEY') || '';
    this.enabled = !!(this.appId && this.appKey);

    if (!this.enabled) {
      this.logger.warn('Submail SMS provider disabled: credentials not configured');
    }
  }

  async send(options: SubmailSmsOptions): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`[DEV] Would send Submail SMS to ${options.to}: ${options.message}`);
      return;
    }

    const signature = this.generateSignature(options);
    
    const body = new URLSearchParams({
      appid: this.appId,
      to: options.to,
      content: options.message,
      signature,
    });

    if (options.from) {
      body.append('from', options.from);
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Submail SMS failed: ${error}`);
      throw new Error(`Submail SMS failed: ${error}`);
    }

    this.logger.log(`Submail SMS sent to ${options.to}`);
  }

  private generateSignature(options: SubmailSmsOptions): string {
    // Submail signature generation
    const signStr = `${this.appKey}${options.to}${options.message}${this.appKey}`;
    return this.md5(signStr);
  }

  private md5(str: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(str).digest('hex');
  }
}