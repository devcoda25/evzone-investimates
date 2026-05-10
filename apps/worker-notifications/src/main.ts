import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { configuration } from "@evzone/config";
import { PrismaModule } from "@evzone/database";
import {
  NotificationsModule,
  NotificationDispatchService,
  NotificationDeliveryService,
} from "@evzone/notifications";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
    NotificationsModule,
  ],
})
class WorkerNotificationsModule {}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerNotifications");
  const app = await NestFactory.createApplicationContext(
    WorkerNotificationsModule,
    {
      logger: ["error", "warn", "log"],
    },
  );
  const queue = app.get(NotificationDispatchService);
  const delivery = app.get(NotificationDeliveryService);
  logger.log("Notification delivery worker started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  while (running) {
    try {
      const jobs = await queue.findReady(50);

      for (const job of jobs) {
        const locked = await queue.markProcessing(job.id);
        if (!locked) continue;

        try {
          await delivery.dispatch(
            job.eventType,
            job.payload as Record<string, unknown>,
          );
          await queue.markSucceeded(job.id);
          logger.log(`Dispatched ${job.eventType} (${job.eventKey})`);
        } catch (error: unknown) {
          const err =
            error instanceof Error
              ? error
              : new Error("Unknown notification dispatch error");
          await queue.markFailed(job.id, err);
          logger.warn(
            `Failed to dispatch ${job.eventType} (${job.eventKey}): ${err.message}`,
          );
        }
      }

      await sleep(jobs.length > 0 ? 250 : 2_000);
    } catch (error: unknown) {
      const err =
        error instanceof Error
          ? error
          : new Error("Unknown worker error");
      logger.error(`Worker loop error: ${err.message}`);
      await sleep(5_000);
    }
  }
}

void bootstrap();
