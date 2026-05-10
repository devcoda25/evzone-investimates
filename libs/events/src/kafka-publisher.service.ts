import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, Producer, SASLOptions } from "kafkajs";
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
    const sasl = this.buildSaslOptions();
    const kafka = new Kafka({
      clientId,
      brokers,
      ssl: this.config.get<boolean>("kafka.ssl") ?? false,
      sasl,
    });
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

  private buildSaslOptions(): SASLOptions | undefined {
    const enabled = this.config.get<boolean>("kafka.saslEnabled") ?? false;
    if (!enabled) return undefined;

    const mechanism =
      this.config.get<string>("kafka.saslMechanism") ?? "plain";
    const username = this.config.get<string>("kafka.saslUsername");
    const password = this.config.get<string>("kafka.saslPassword");

    if (!username || !password) {
      this.logger.warn(
        "Kafka SASL is enabled but credentials are incomplete; continuing without SASL",
      );
      return undefined;
    }

    if (mechanism === "plain") {
      return { mechanism: "plain", username, password };
    }

    if (mechanism === "scram-sha-256") {
      return { mechanism: "scram-sha-256", username, password };
    }

    if (mechanism === "scram-sha-512") {
      return { mechanism: "scram-sha-512", username, password };
    }

    this.logger.warn(
      `Kafka SASL mechanism "${mechanism}" is not supported by this runtime configuration`,
    );
    return undefined;
  }
}
