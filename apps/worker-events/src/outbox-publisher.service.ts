import { Injectable, Logger } from "@nestjs/common";
import {
  KafkaPublisherService,
  OutboxService,
  PendingOutboxEvent,
} from "@evzone/events";
import { NotificationDispatchService } from "@evzone/notifications";

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);

  constructor(
    private readonly outbox: OutboxService,
    private readonly publisher: KafkaPublisherService,
    private readonly notificationDispatch: NotificationDispatchService,
  ) {}

  async processBatch(limit = 50): Promise<number> {
    const events = await this.outbox.findPending(limit);

    for (const event of events) {
      await this.processEvent(event);
    }

    return events.length;
  }

  async processEvent(event: PendingOutboxEvent): Promise<void> {
    try {
      await this.publisher.publish(event.topic, event.eventKey, event.payload);
      await this.outbox.markPublished(event.id);
      await this.notificationDispatch.enqueueFromEvent(event);
    } catch (error: unknown) {
      const err =
        error instanceof Error
          ? error
          : new Error("Unknown outbox publish error");
      await this.outbox.markFailed(event.id, err);
      this.logger.warn(`Failed to publish ${event.id}: ${err.message}`);
    }
  }
}
