import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { EmailOptions } from "../types";

@Injectable()
export class SmtpProvider {
  private readonly logger = new Logger(SmtpProvider.name);
  private readonly defaultFrom: string;
  private readonly enabled: boolean;
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>("SMTP_HOST") ?? "";
    const port = this.configService.get<number>("SMTP_PORT") ?? 587;
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");

    this.defaultFrom =
      this.configService.get<string>("SMTP_FROM") ?? "noreply@evzone.com";
    this.enabled = !!(host && user && pass);

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn("SMTP provider disabled: credentials not configured");
    }
  }

  async send(options: EmailOptions): Promise<void> {
    if (!this.enabled || !this.transporter) {
      this.logger.debug(
        `[DEV] Would send SMTP email to ${String(options.to)}: ${options.subject}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: options.from ?? this.defaultFrom,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      cc: options.cc,
      bcc: options.bcc,
      attachments: options.attachments,
    });
    this.logger.log(`SMTP email sent to ${String(options.to)}: ${options.subject}`);
  }
}
