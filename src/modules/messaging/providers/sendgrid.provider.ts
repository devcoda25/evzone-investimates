import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

export interface SendGridEmailOptions {
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
}

@Injectable()
export class SendGridProvider {
  private readonly logger = new Logger(SendGridProvider.name);
  private readonly defaultFrom: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    this.defaultFrom = this.configService.get<string>('SENDGRID_FROM') || 'noreply@evzone.com';
    this.enabled = !!apiKey;

    if (this.enabled) {
      sgMail.setApiKey(apiKey!);
    } else {
      this.logger.warn('SendGrid provider disabled: API key not configured');
    }
  }

  async send(options: SendGridEmailOptions): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`[DEV] Would send SendGrid email to ${options.to}: ${options.subject}`);
      return;
    }

    const msg = {
      to: options.to,
      from: options.from || this.defaultFrom,
      subject: options.subject,
      text: options.text,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
      attachments: options.attachments?.map((att) => ({
        content: att.content instanceof Buffer ? att.content.toString('base64') : att.content,
        filename: att.filename,
        type: att.contentType,
        disposition: 'attachment',
      })),
    };

    await sgMail.send(msg);
    this.logger.log(`SendGrid email sent to ${options.to}: ${options.subject}`);
  }
}