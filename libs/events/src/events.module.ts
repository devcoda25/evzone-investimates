import { Global, Module } from "@nestjs/common";
import { KafkaPublisherService } from "./kafka-publisher.service";
import { OutboxService } from "./outbox.service";

@Global()
@Module({
  providers: [KafkaPublisherService, OutboxService],
  exports: [KafkaPublisherService, OutboxService],
})
export class EventsModule {}
