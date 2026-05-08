import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface ZohoEmailOptions {
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
export class ZohoProvider {
  private readonly logger = new Logger(ZohoProvider.name);
  private readonly defaultFrom: string;
  private readonly enabled: boolean;
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('ZOHO_SMTP_HOST') || 'smtp.zoho.com';
    const port = this.configService.get<number>('ZOHO_SMTP_PORT') || 587;
    const user = this.configService.get<string>('ZOHO_SMTP_USER');
    const pass = this.configService.get<string>('ZOHO_SMTP_PASS');
    
    this.defaultFrom = this.configService.get<string>('ZOHO_FROM') || 'noreply@evzone.com';
    this.enabled = !!(user && pass);

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn('Zoho provider disabled: SMTP credentials not configured');
    }
  }

  async send(options: ZohoEmailOptions): Promise<void> {
    if (!this.enabled || !this.transporter) {
      this.logger.debug(`[DEV] Would send Zoho email to ${options.to}: ${options.subject}`);
      return;
    }

    const mailOptions = {
      from: options.from || this.defaultFrom,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
      attachments: options.attachments,
    };

    await this.transporter.sendMail(mailOptions);
    this.logger.log(`Zoho email sent to ${options.to}: ${options.subject}`);
  }
}