import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Consumer, EachMessagePayload, Kafka } from "kafkajs";

export interface KafkaMessageHandler {
  topic: string;
  handle(payload: EachMessagePayload): Promise<void>;
}

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly consumer: Consumer;
  private readonly handlers = new Map<string, KafkaMessageHandler>();

  constructor(private readonly config: ConfigService) {
    const brokers = this.config.get<string[]>("kafka.brokers") ?? [
      "localhost:9092",
    ];
    const clientId =
      this.config.get<string>("kafka.clientId") ?? "evzone-platform";
    const groupId =
      this.config.get<string>("kafka.consumerGroup") ?? "evzone-consumer";
    const kafka = new Kafka({ clientId, brokers });
    this.consumer = kafka.consumer({ groupId });
  }

  async onModuleInit(): Promise<void> {
    await this.consumer.connect();
    this.logger.log("Kafka consumer connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
    this.logger.log("Kafka consumer disconnected");
  }

  registerHandler(handler: KafkaMessageHandler): void {
    this.handlers.set(handler.topic, handler);
  }

  async startConsuming(): Promise<void> {
    const topics = Array.from(this.handlers.keys());
    if (topics.length === 0) {
      this.logger.warn("No Kafka handlers registered");
      return;
    }

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.logger.log(`Subscribed to Kafka topic: ${topic}`);
    }

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const handler = this.handlers.get(payload.topic);
        if (!handler) {
          this.logger.warn(`No handler for topic: ${payload.topic}`);
          return;
        }
        try {
          await handler.handle(payload);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          this.logger.error(
            `Error handling message on ${payload.topic}: ${message}`,
          );
          // In production, implement dead-letter queue here
          throw error;
        }
      },
    });
  }
}
