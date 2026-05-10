import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { MediaStatus, Prisma } from "@prisma/client";
import { Kafka, KafkaMessage, SASLOptions } from "kafkajs";
import { configuration } from "@evzone/config";
import { PrismaModule, PrismaService } from "@evzone/database";
import { StorageModule, StorageService } from "@evzone/storage";
import { EventsModule } from "@evzone/events";
import sharp from "sharp";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
    StorageModule,
    EventsModule,
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

function buildSaslOptions(): SASLOptions | undefined {
  const enabled = process.env.KAFKA_SASL_ENABLED === "true";
  if (!enabled) return undefined;
  const mechanism = process.env.KAFKA_SASL_MECHANISM ?? "plain";
  const username = process.env.KAFKA_SASL_USERNAME;
  const password = process.env.KAFKA_SASL_PASSWORD;
  if (!username || !password) return undefined;
  if (mechanism === "scram-sha-256") {
    return { mechanism: "scram-sha-256", username, password };
  }
  if (mechanism === "scram-sha-512") {
    return { mechanism: "scram-sha-512", username, password };
  }
  return { mechanism: "plain", username, password };
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerMedia");
  const app = await NestFactory.createApplicationContext(WorkerMediaModule, {
    logger: ["error", "warn", "log"],
  });
  const prisma = app.get(PrismaService);
  const storage = app.get(StorageService);

  // Kafka consumer setup
  const kafka = new Kafka({
    clientId: "worker-media",
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
    ssl: process.env.KAFKA_SSL === "true" ? {} : false,
    sasl: buildSaslOptions(),
  });
  const consumer = kafka.consumer({ groupId: "worker-media" });
  await consumer.connect();
  await consumer.subscribe({ topic: "media.upload.completed", fromBeginning: false });

  logger.log("Media worker started");
  let running = true;

  process.on("SIGTERM", async () => {
    running = false;
    await consumer.disconnect();
    await app.close();
  });

  // Process Kafka messages for media uploads
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value?.toString() ?? "{}");
        const mediaAssetId = event.payload?.mediaAssetId;
        if (!mediaAssetId) return;

        const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
        if (!asset || asset.status !== "UPLOADED") return;

        logger.log(`Processing media asset: ${mediaAssetId}`);

        // Validate file exists and get metadata using StorageService
        try {
          const headResult = await storage.headObject(asset.objectKey);

          // Update metadata
          await prisma.mediaAsset.update({
            where: { id: mediaAssetId },
            data: {
              sizeBytes: headResult.ContentLength ?? undefined,
              contentType: headResult.ContentType ?? undefined,
              checksum: headResult.ETag?.replace(/"/g, "") ?? undefined,
              status: MediaStatus.VALIDATING,
            },
          });

          // Generate thumbnail for images
          if (headResult.ContentType?.startsWith("image/")) {
            const objectResult = await storage.getObject(asset.objectKey);
            const bodyBuffer = await streamToBuffer(objectResult.Body as any);

            const thumbnailBuffer = await sharp(bodyBuffer)
              .resize(400, 400, { fit: "inside" })
              .toFormat("webp")
              .toBuffer();

            const thumbnailKey = asset.objectKey.replace(/\.[^.]+$/, "") + "-thumb.webp";
            await storage.putObject({
              objectKey: thumbnailKey,
              contentType: "image/webp",
              body: thumbnailBuffer,
            });

            const readUrl = await storage.createReadUrl(thumbnailKey);
            await prisma.mediaAsset.update({
              where: { id: mediaAssetId },
              data: {
                publicUrl: readUrl,
                width: 400,
                height: 400,
                status: MediaStatus.READY,
              },
            });
            logger.log(`Generated thumbnail for ${mediaAssetId}`);
          } else {
            // Non-image: mark as ready after validation
            await prisma.mediaAsset.update({
              where: { id: mediaAssetId },
              data: { status: MediaStatus.READY },
            });
          }

          logger.log(`Media asset ready: ${mediaAssetId}`);
        } catch (err: any) {
          logger.error(`Failed to process media ${mediaAssetId}: ${err.message}`);
          await prisma.mediaAsset.update({
            where: { id: mediaAssetId },
            data: { status: MediaStatus.REJECTED },
          });
        }
      } catch (err: any) {
        logger.error(`Error processing message: ${err.message}`);
      }
    },
  });

  // Fallback polling for assets stuck in PENDING_UPLOAD
  while (running) {
    const pendingAssets = await prisma.mediaAsset.findMany({
      where: { status: MediaStatus.PENDING_UPLOAD },
      take: 10,
      orderBy: { createdAt: "asc" },
    });
    for (const asset of pendingAssets) {
      logger.warn(`Stuck pending upload asset: ${asset.id} created at ${asset.createdAt}`);
    }
    await sleep(30_000);
  }
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

void bootstrap();
