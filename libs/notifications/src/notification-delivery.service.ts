import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@evzone/database";
import { EmailOptions, PushOptions, SmsOptions } from "./types";
import { PushProvider } from "./providers/push.provider";
import { SendGridProvider } from "./providers/sendgrid.provider";
import { SmtpProvider } from "./providers/smtp.provider";
import { TwilioProvider } from "./providers/twilio.provider";

interface EventHandlerResult {
  userId: string;
  channels: string[];
  title: string;
  message: string;
  email?: EmailOptions;
  sms?: SmsOptions;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGrid: SendGridProvider,
    private readonly smtp: SmtpProvider,
    private readonly twilio: TwilioProvider,
    private readonly push: PushProvider,
  ) {}

  async dispatch(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const handler = this.getHandler(eventType);
    if (!handler) {
      this.logger.debug(`No notification handler for event: ${eventType}`);
      return;
    }

    const notification = handler(payload);
    if (!notification) return;

    await this.deliver(notification);
  }

  supportsEventType(eventType: string): boolean {
    return this.getHandler(eventType) !== null;
  }

  private async deliver(
    notification: EventHandlerResult,
  ): Promise<void> {
    const { userId, channels, title, message, email, sms } = notification;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    if (!user) {
      this.logger.warn(`User ${userId} not found, skipping notification`);
      return;
    }

    const deliveryChannels: string[] = [];

    if (channels.includes("in_app")) {
      await this.createInAppNotification(userId, title, message, channels);
      deliveryChannels.push("in_app");
    }

    if (channels.includes("email") && email && user.email) {
      try {
        await this.sendGrid.send({ ...email, to: user.email });
        deliveryChannels.push("email");
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Email delivery failed: ${err.message}`);
        // Fallback to SMTP
        try {
          await this.smtp.send({ ...email, to: user.email });
          deliveryChannels.push("email_smtp");
        } catch (smtpErr: unknown) {
          const se =
            smtpErr instanceof Error ? smtpErr : new Error(String(smtpErr));
          this.logger.warn(`SMTP fallback failed: ${se.message}`);
        }
      }
    }

    if (channels.includes("sms") && sms && user.phone) {
      try {
        await this.twilio.send({ ...sms, to: user.phone });
        deliveryChannels.push("sms");
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`SMS delivery failed: ${err.message}`);
      }
    }

    if (channels.includes("push")) {
      const subs = await this.prisma.pushSubscription.findMany({
        where: { userId },
      });
      for (const sub of subs) {
        try {
          const pushPayload: PushOptions = {
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
            title,
            body: message,
            data: { userId, type: notification.channels.join(",") },
          };
          await this.push.send(pushPayload);
          deliveryChannels.push("push");
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.warn(
            `Push delivery failed for ${sub.endpoint}: ${err.message}`,
          );
        }
      }
    }

    this.logger.log(
      `Notification dispatched to ${userId} via [${deliveryChannels.join(", ")}]`,
    );
  }

  private async createInAppNotification(
    userId: string,
    title: string,
    message: string,
    channels: string[],
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: "SYSTEM",
        channels,
      },
    });
  }

  private getHandler(
    eventType: string,
  ): ((payload: Record<string, unknown>) => EventHandlerResult | null) | null {
    const handlers: Record<
      string,
      (payload: Record<string, unknown>) => EventHandlerResult | null
    > = {
      "user.created": (payload) => {
        const userId = String(payload.userId ?? "");
        const email = String(payload.email ?? "");
        if (!userId) return null;
        return {
          userId,
          channels: ["in_app", "email"],
          title: "Welcome to EVzone",
          message: "Your account has been created successfully.",
          email: {
            to: email,
            subject: "Welcome to EVzone",
            html: `<p>Welcome! Your account is ready.</p>`,
          },
        };
      },
      "investment.created": (payload) => {
        const userId = String(payload.investorUserId ?? "");
        const amount = Number(payload.amount ?? 0);
        if (!userId) return null;
        return {
          userId,
          channels: ["in_app", "email", "push"],
          title: "Investment Confirmed",
          message: `Your investment of $${amount.toLocaleString()} has been received and is pending compliance review.`,
          email: {
            to: "",
            subject: "Investment Confirmation",
            html: `<p>Your investment of $${amount.toLocaleString()} is pending compliance review.</p>`,
          },
        };
      },
      "project.published": () => {
        // This event would ideally be sent to followers; for now we skip
        // because the payload doesn't include a target userId.
        return null;
      },
      "project.approved": (payload) => {
        const _projectId = String(payload.projectId ?? "");
        const ownerUserId = String(payload.ownerUserId ?? "");
        if (!ownerUserId) return null;
        return {
          userId: ownerUserId,
          channels: ["in_app", "email", "push"],
          title: "Project Approved",
          message: "Your project has been approved and is now active.",
          email: {
            to: "",
            subject: "Project Approved",
            html: `<p>Your project has been approved and is now active.</p>`,
          },
        };
      },
      "project.rejected": (payload) => {
        const ownerUserId = String(payload.ownerUserId ?? "");
        if (!ownerUserId) return null;
        return {
          userId: ownerUserId,
          channels: ["in_app", "email"],
          title: "Project Rejected",
          message: "Your project submission was not approved.",
          email: {
            to: "",
            subject: "Project Rejected",
            html: `<p>Your project submission was not approved.</p>`,
          },
        };
      },
      "project.revision-requested": (payload) => {
        const ownerUserId = String(payload.ownerUserId ?? "");
        if (!ownerUserId) return null;
        return {
          userId: ownerUserId,
          channels: ["in_app", "email", "push"],
          title: "Revision Requested",
          message: "Please revise your project submission.",
          email: {
            to: "",
            subject: "Project Revision Requested",
            html: `<p>Please revise your project submission.</p>`,
          },
        };
      },
    };

    return handlers[eventType] ?? null;
  }
}
