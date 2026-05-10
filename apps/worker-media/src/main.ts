import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { MediaStatus } from "@prisma/client";
import { configuration } from "@evzone/config";
import { PrismaModule, PrismaService } from "@evzone/database";
import { StorageModule, StorageService } from "@evzone/storage";

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

/**
 * Pause execution for the specified number of milliseconds.
 *
 * @param ms - The delay duration in milliseconds
 * @returns Nothing
 */
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const ALLOWED_CONTENT_TYPES: string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "application/pdf",
];

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; /**
 * Start the media worker that validates queued uploaded media assets and advances their statuses.
 *
 * Runs a continuous loop that fetches media assets with status `UPLOADED`, validates each asset's
 * content type, size (when provided), and presence in storage, updates the asset status to
 * `READY` or `REJECTED` based on those checks, logs processing events, and terminates cleanly on
 * `SIGTERM`.
 */

async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerMedia");
  const app = await NestFactory.createApplicationContext(WorkerMediaModule, {
    logger: ["error", "warn", "log"],
  });
  const prisma = app.get(PrismaService);
  const storage = app.get(StorageService);
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
      try {
        // 1. Validate content type
        if (!ALLOWED_CONTENT_TYPES.includes(asset.contentType)) {
          logger.warn(
            `Rejected media ${asset.id}: unsupported content type ${asset.contentType}`,
          );
          await prisma.mediaAsset.update({
            where: { id: asset.id },
            data: { status: MediaStatus.REJECTED },
          });
          continue;
        }

        // 2. Validate size if known
        if (asset.sizeBytes && asset.sizeBytes > MAX_FILE_SIZE_BYTES) {
          logger.warn(
            `Rejected media ${asset.id}: size ${asset.sizeBytes} exceeds limit`,
          );
          await prisma.mediaAsset.update({
            where: { id: asset.id },
            data: { status: MediaStatus.REJECTED },
          });
          continue;
        }

        // 3. Verify object exists in storage
        try {
          await storage.createReadUrl(asset.objectKey);
        } catch (verifyError: unknown) {
          logger.warn(
            `Media ${asset.id} not found in storage: ${
              verifyError instanceof Error ? verifyError.message : "unknown"
            }`,
          );
          await prisma.mediaAsset.update({
            where: { id: asset.id },
            data: { status: MediaStatus.REJECTED },
          });
          continue;
        }

        // 4. Mark ready
        await prisma.mediaAsset.update({
          where: { id: asset.id },
          data: { status: MediaStatus.READY },
        });
        logger.log(`Marked media asset ready: ${asset.id}`);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to process media ${asset.id}: ${message}`);
      }
    }

    await sleep(assets.length > 0 ? 500 : 5_000);
  }
}

void bootstrap();
