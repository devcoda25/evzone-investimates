import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendGridProvider } from './sendgrid.provider';
import { ZohoProvider } from './zoho.provider';
import { SubmailEmailProvider } from './submail-email.provider';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  region?: 'global' | 'china';
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly defaultFrom: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly sendGrid: SendGridProvider,
    private readonly zoho: ZohoProvider,
    private readonly submail: SubmailEmailProvider,
  ) {
    this.defaultFrom = this.configService.get<string>('smtp.from') || 'noreply@evzone.com';
  }

  /**
   * Send email using the appropriate provider based on region
   * - Global: SendGrid (default) or Zoho
   * - China: Submail
   */
  async send(options: EmailOptions): Promise<void> {
    const region = options.region || 'global';
    const to = Array.isArray(options.to) ? options.to : [options.to];

    try {
      if (region === 'china') {
        // Use Submail for China
        await this.submail.send({
          ...options,
          to: to.join(','),
        });
      } else {
        // Use SendGrid (default) for global
        await this.sendGrid.send({
          ...options,
          to,
        });
      }
      this.logger.log(`Email sent successfully to ${to.join(', ')}: ${options.subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Send email via SendGrid (global default)
   */
  async sendViaSendGrid(options: EmailOptions): Promise<void> {
    await this.sendGrid.send(options);
  }

  /**
   * Send email via Zoho
   */
  async sendViaZoho(options: EmailOptions): Promise<void> {
    await this.zoho.send(options);
  }

  /**
   * Send email via Submail (China)
   */
  async sendViaSubmail(options: EmailOptions): Promise<void> {
    await this.submail.send(options);
  }
}