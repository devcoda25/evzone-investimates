export type NotificationChannel = "in_app" | "email" | "sms" | "push";

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
}

export interface SmsOptions {
  to: string;
  message: string;
  from?: string;
}

export interface PushOptions {
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotificationPayload {
  userId: string;
  tenantId?: string;
  title: string;
  message: string;
  type: string;
  channels: NotificationChannel[];
  data?: Record<string, unknown>;
  email?: EmailOptions;
  sms?: SmsOptions;
}
