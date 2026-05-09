import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { configuration } from "@evzone/config";
import { PrismaModule } from "@evzone/database";
import { EventsModule } from "@evzone/events";
import { NotificationsModule } from "@evzone/notifications";
import { OutboxPublisherService } from "./outbox-publisher.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
    EventsModule,
    NotificationsModule,
  ],
  providers: [OutboxPublisherService],
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
  const publisher = app.get(OutboxPublisherService);
  logger.log("Outbox publisher started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  while (running) {
    const processed = await publisher.processBatch(50);
    await sleep(processed > 0 ? 250 : 2_000);
  }
}

void bootstrap();
