import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { configuration } from "@evzone/config";
import { PrismaModule } from "@evzone/database";
import {
  EventsModule,
  KafkaPublisherService,
  OutboxService,
} from "@evzone/events";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
    EventsModule,
  ],
})
class WorkerEventsModule {}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerEvents");
  const app = await NestFactory.createApplicationContext(WorkerEventsModule, {
    logger: ["error", "warn", "log"],
  });
  const outbox = app.get(OutboxService);
  const publisher = app.get(KafkaPublisherService);
  logger.log("Outbox publisher started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  while (running) {
    const events = await outbox.findPending(50);
    for (const event of events) {
      try {
        await publisher.publish(event.topic, event.eventKey, event.payload);
        await outbox.markPublished(event.id);
      } catch (error: unknown) {
        const err =
          error instanceof Error
            ? error
            : new Error("Unknown outbox publish error");
        await outbox.markFailed(event.id, err);
        logger.warn(`Failed to publish ${event.id}: ${err.message}`);
      }
    }
    await sleep(events.length > 0 ? 250 : 2_000);
  }
}

void bootstrap();
