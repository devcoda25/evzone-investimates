import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SubmailEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

@Injectable()
export class SubmailEmailProvider {
  private readonly logger = new Logger(SubmailEmailProvider.name);
  private readonly appId: string;
  private readonly appKey: string;
  private readonly enabled: boolean;
  private readonly baseUrl = 'https://api.mysubmail.com/mail/send.json';

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('SUBMAIL_EMAIL_APP_ID') || '';
    this.appKey = this.configService.get<string>('SUBMAIL_EMAIL_APP_KEY') || '';
    this.enabled = !!(this.appId && this.appKey);

    if (!this.enabled) {
      this.logger.warn('Submail email provider disabled: credentials not configured');
    }
  }

  async send(options: SubmailEmailOptions): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`[DEV] Would send Submail email to ${options.to}: ${options.subject}`);
      return;
    }

    const signature = this.generateSignature(options);
    
    const body = new URLSearchParams({
      appid: this.appId,
      to: options.to,
      subject: options.subject,
      content: options.html || options.text || '',
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
      this.logger.error(`Submail email failed: ${error}`);
      throw new Error(`Submail email failed: ${error}`);
    }

    this.logger.log(`Submail email sent to ${options.to}: ${options.subject}`);
  }

  private generateSignature(options: SubmailEmailOptions): string {
    // Submail signature generation
    const signStr = `${this.appKey}${options.to}${options.subject}${options.html || options.text || ''}${this.appKey}`;
    return this.md5(signStr);
  }

  private md5(str: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(str).digest('hex');
  }
}