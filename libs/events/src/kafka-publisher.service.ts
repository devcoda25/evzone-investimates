import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, Producer } from "kafkajs";
import { Prisma } from "@prisma/client";

@Injectable()
export class KafkaPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaPublisherService.name);
  private producer: Producer | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const brokers = this.config.get<string[]>("kafka.brokers") ?? [
      "localhost:9092",
    ];
    const clientId =
      this.config.get<string>("kafka.clientId") ?? "evzone-platform";
    const kafka = new Kafka({ clientId, brokers });
    this.producer = kafka.producer();
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
  }

  async publish(
    topic: string,
    key: string,
    payload: Prisma.JsonValue,
  ): Promise<void> {
    if (!this.producer) {
      this.logger.warn(`Kafka producer is not connected; skipped ${topic}`);
      return;
    }
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(payload) }],
    });
  }
}
