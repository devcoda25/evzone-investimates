import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { configuration } from "@evzone/config";
import { PrismaModule } from "@evzone/database";
import { EventsModule } from "@evzone/events";
import { FlutterwaveAdapter } from "../../api/src/modules/payments/flutterwave.adapter";
import { PaytotaAdapter } from "../../api/src/modules/payments/paytota.adapter";
import { LedgerPostingService } from "../../api/src/modules/payments/ledger-posting.service";
import { WebhookProcessingService } from "./webhook-processing.service";

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
  providers: [
    FlutterwaveAdapter,
    PaytotaAdapter,
    LedgerPostingService,
    WebhookProcessingService,
  ],
})
class WorkerWebhooksModule {}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts the long-running webhook worker that polls pending payment webhook events and processes them.
 *
 * The worker verifies provider collections, records payment transactions, updates payment intents and related investments, posts ledger entries, creates outbox events, and marks webhook events as processed or failed. It runs until receiving SIGTERM, at which point it initiates shutdown.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerWebhooks");
  const app = await NestFactory.createApplicationContext(
    WorkerWebhooksModule,
    { logger: ["error", "warn", "log"] },
  );
  const processor = app.get(WebhookProcessingService);

  logger.log("Webhook worker started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  while (running) {
    const processed = await processor.processPendingBatch(25);
    await sleep(processed > 0 ? 500 : 5_000);
  }
}

void bootstrap();
