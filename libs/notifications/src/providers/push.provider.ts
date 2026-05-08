import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as webPush from "web-push";
import { PushOptions } from "../types";

@Injectable()
export class PushProvider {
  private readonly logger = new Logger(PushProvider.name);
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const vapidPublicKey = this.configService.get<string>("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = this.configService.get<string>("VAPID_PRIVATE_KEY");
    const vapidSubject = this.configService.get<string>(
      "VAPID_SUBJECT",
      "mailto:admin@evzone.com",
    );

    this.enabled = !!(vapidPublicKey && vapidPrivateKey);

    if (this.enabled) {
      webPush.setVapidDetails(
        vapidSubject,
        vapidPublicKey!,
        vapidPrivateKey!,
      );
    } else {
      this.logger.warn("Push provider disabled: VAPID keys not configured");
    }
  }

  async send(options: PushOptions): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(
        `[DEV] Would send push notification to ${options.endpoint}: ${options.title}`,
      );
      return;
    }

    const payload = JSON.stringify({
      title: options.title,
      body: options.body,
      data: options.data,
    });

    await webPush.sendNotification(
      {
        endpoint: options.endpoint,
        keys: {
          p256dh: options.p256dh,
          auth: options.auth,
        },
      },
      payload,
    );

    this.logger.log(`Push notification sent to ${options.endpoint}`);
  }
}
