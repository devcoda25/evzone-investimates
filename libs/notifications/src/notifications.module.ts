import { Global, Module } from "@nestjs/common";
import { PushProvider } from "./providers/push.provider";
import { SendGridProvider } from "./providers/sendgrid.provider";
import { SmtpProvider } from "./providers/smtp.provider";
import { TwilioProvider } from "./providers/twilio.provider";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { NotificationDispatchService } from "./notification-dispatch.service";

@Global()
@Module({
  providers: [
    SendGridProvider,
    SmtpProvider,
    TwilioProvider,
    PushProvider,
    NotificationDeliveryService,
    NotificationDispatchService,
  ],
  exports: [NotificationDeliveryService, NotificationDispatchService],
})
export class NotificationsModule {}
