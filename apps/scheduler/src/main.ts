import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DealStatus } from "@prisma/client";
import { configuration } from "@evzone/config";
import { PrismaModule, PrismaService } from "@evzone/database";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
  ],
})
class SchedulerModule {}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("Scheduler");
  const app = await NestFactory.createApplicationContext(SchedulerModule, {
    logger: ["error", "warn", "log"],
  });
  const prisma = app.get(PrismaService);
  logger.log("Scheduler started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  while (running) {
    const result = await prisma.deal.updateMany({
      where: { status: DealStatus.LIVE, closesAt: { lte: new Date() } },
      data: { status: DealStatus.CLOSED_SUCCESSFUL },
    });
    if (result.count > 0)
      logger.log(`Closed ${result.count} expired live deal(s)`);
    await sleep(60_000);
  }
}

void bootstrap();
