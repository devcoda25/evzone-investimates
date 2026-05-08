import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { configuration } from "@evzone/config";
import { PrismaModule } from "@evzone/database";
import { PrismaService } from "@evzone/database";
import {
  NotificationsModule,
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
  const prisma = app.get(PrismaService);
  const delivery = app.get(NotificationDeliveryService);
  logger.log("Notification delivery worker started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  while (running) {
    try {
      const events = await prisma.outboxEvent.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true,
          eventType: true,
          payload: true,
          createdAt: true,
        },
      });

      for (const event of events) {
        try {
          await delivery.dispatch(
            event.eventType,
            event.payload as Record<string, unknown>,
          );
          logger.log(`Dispatched ${event.eventType} (${event.id})`);
        } catch (error: unknown) {
          const err =
            error instanceof Error
              ? error
              : new Error("Unknown notification dispatch error");
          logger.warn(
            `Failed to dispatch ${event.eventType} (${event.id}): ${err.message}`,
          );
        }
      }

      await sleep(events.length > 0 ? 250 : 2_000);
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
