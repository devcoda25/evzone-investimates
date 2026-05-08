import { Injectable, Logger } from '@nestjs/common';
import { EmailService, EmailOptions } from './providers/email.service';
import { SmsService, SmsOptions } from './providers/sms.service';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
  ) {}

  // Email methods
  async sendEmail(options: EmailOptions): Promise<void> {
    return this.emailService.send(options);
  }

  async sendWelcomeEmail(email: string, firstName: string, role: string): Promise<void> {
    const subject = `Welcome to EVzone, ${firstName}!`;
    const html = `
      <h1>Welcome to EVzone!</h1>
      <p>Hello ${firstName},</p>
      <p>Your account as a <strong>${role}</strong> has been created successfully.</p>
      <p>You can now log in to access the platform.</p>
      <p>Best regards,<br>The EVzone Team</p>
    `;
    
    await this.emailService.send({
      to: email,
      subject,
      html,
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string, firstName: string): Promise<void> {
    const subject = 'Password Reset Request';
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    const html = `
      <h1>Password Reset</h1>
      <p>Hello ${firstName},</p>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;
    
    await this.emailService.send({
      to: email,
      subject,
      html,
    });
  }

  async sendNotificationEmail(email: string, title: string, message: string): Promise<void> {
    const subject = `[EVzone] ${title}`;
    const html = `
      <h2>${title}</h2>
      <p>${message}</p>
      <hr>
      <p><small>You received this email because you have notifications enabled in your EVzone account.</small></p>
    `;
    
    await this.emailService.send({
      to: email,
      subject,
      html,
    });
  }

  // SMS methods
  async sendSms(options: SmsOptions): Promise<void> {
    return this.smsService.send(options);
  }

  async sendWelcomeSms(phone: string, firstName: string): Promise<void> {
    const message = `Welcome to EVzone, ${firstName}! Your account is ready. Log in to get started.`;
    await this.smsService.send({ to: phone, message });
  }

  async sendOtpSms(phone: string, otp: string): Promise<void> {
    const message = `Your EVzone verification code is: ${otp}. It expires in 10 minutes.`;
    await this.smsService.send({ to: phone, message });
  }

  async sendPasswordResetSms(phone: string, resetCode: string): Promise<void> {
    const message = `Your EVzone password reset code is: ${resetCode}. It expires in 1 hour.`;
    await this.smsService.send({ to: phone, message });
  }

  // Combined methods
  async sendVerification(email: string, phone: string, firstName: string, otp: string): Promise<void> {
    await Promise.all([
      this.sendOtpSms(phone, otp),
      this.sendEmail({
        to: email,
        subject: 'Your EVzone Verification Code',
        html: `<p>Your verification code is: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p>`,
      }),
    ]);
  }
}
