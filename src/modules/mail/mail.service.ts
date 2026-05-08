import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendMailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly defaultFrom: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.defaultFrom = this.configService.get<string>('smtp.from') || 'noreply@evzone.com';
    const host = this.configService.get<string>('smtp.host');
    const user = this.configService.get<string>('smtp.user');
    this.enabled = !!(host && user);

    if (!this.enabled) {
      this.logger.warn('Mail service disabled: SMTP credentials not configured');
    }
  }

  async send(options: SendMailOptions): Promise<void> {
    this.logger.debug(`[DEV] Would send email to ${options.to}: ${options.subject}`);
  }

  async sendPasswordReset(email: string, resetToken: string, firstName: string): Promise<void> {
    this.logger.debug(`[DEV] Would send password reset to ${email}`);
  }

  async sendWelcome(email: string, firstName: string, role: string): Promise<void> {
    this.logger.debug(`[DEV] Would send welcome email to ${email}`);
  }

  async sendNotification(email: string, title: string, message: string): Promise<void> {
    this.logger.debug(`[DEV] Would send notification to ${email}: ${title}`);
  }
}
