import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { MediaStatus } from "@prisma/client";
import { configuration } from "@evzone/config";
import { PrismaModule, PrismaService } from "@evzone/database";
import { StorageModule } from "@evzone/storage";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
    StorageModule,
  ],
})
class WorkerMediaModule {}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerMedia");
  const app = await NestFactory.createApplicationContext(WorkerMediaModule, {
    logger: ["error", "warn", "log"],
  });
  const prisma = app.get(PrismaService);
  logger.log("Media worker started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  while (running) {
    const assets = await prisma.mediaAsset.findMany({
      where: { status: MediaStatus.UPLOADED },
      take: 25,
      orderBy: { createdAt: "asc" },
    });
    for (const asset of assets) {
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { status: MediaStatus.READY },
      });
      logger.log(`Marked media asset ready: ${asset.id}`);
    }
    await sleep(assets.length > 0 ? 500 : 5_000);
  }
}

void bootstrap();
