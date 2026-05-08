import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  PaymentProvider,
  PaymentStatus,
  Prisma,
  WebhookProcessingStatus,
} from "@prisma/client";
import { configuration } from "@evzone/config";
import { PrismaModule, PrismaService, TransactionService } from "@evzone/database";
import { OutboxService } from "@evzone/events";
import { FlutterwaveAdapter } from "../../api/src/modules/payments/flutterwave.adapter";
import { PaytotaAdapter } from "../../api/src/modules/payments/paytota.adapter";
import { LedgerPostingService } from "../../api/src/modules/payments/ledger-posting.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
  ],
  providers: [FlutterwaveAdapter, PaytotaAdapter, LedgerPostingService],
})
class WorkerWebhooksModule {}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerWebhooks");
  const app = await NestFactory.createApplicationContext(
    WorkerWebhooksModule,
    { logger: ["error", "warn", "log"] },
  );
  const prisma = app.get(PrismaService);
  const transactions = app.get(TransactionService);
  const outbox = app.get(OutboxService);
  const flutterwave = app.get(FlutterwaveAdapter);
  const paytota = app.get(PaytotaAdapter);
  const ledger = app.get(LedgerPostingService);

  logger.log("Webhook worker started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  function getAdapter(provider: PaymentProvider) {
    switch (provider) {
      case PaymentProvider.FLUTTERWAVE:
        return flutterwave;
      case PaymentProvider.PAYTOTA:
        return paytota;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  while (running) {
    const events = await prisma.paymentWebhookEvent.findMany({
      where: { processingStatus: WebhookProcessingStatus.PENDING },
      take: 25,
      orderBy: { createdAt: "asc" },
    });

    for (const event of events) {
      try {
        const payload = event.payload as Record<string, unknown>;
        let intentRef: string | null = null;

        if (event.provider === PaymentProvider.FLUTTERWAVE) {
          intentRef =
            (payload.data as Record<string, unknown>)?.tx_ref as string ?? null;
        } else if (event.provider === PaymentProvider.PAYTOTA) {
          intentRef =
            (payload.reference as string) ??
            (payload.data as Record<string, unknown>)?.reference as string ??
            null;
        }

        if (!intentRef) {
          logger.warn(`No intent reference in webhook event ${event.id}`);
          await prisma.paymentWebhookEvent.update({
            where: { id: event.id },
            data: {
              processingStatus: WebhookProcessingStatus.FAILED,
              errorMessage: "No intent reference found in payload",
            },
          });
          continue;
        }

        const intent = await prisma.paymentIntent.findUnique({
          where: { internalReference: intentRef },
        });
        if (!intent) {
          logger.warn(
            `No payment intent found for ref ${intentRef} in event ${event.id}`,
          );
          await prisma.paymentWebhookEvent.update({
            where: { id: event.id },
            data: {
              processingStatus: WebhookProcessingStatus.FAILED,
              errorMessage: `No payment intent found for ref ${intentRef}`,
            },
          });
          continue;
        }

        if (!intent.providerTransactionId) {
          logger.warn(
            `Intent ${intent.id} has no provider transaction ID`,
          );
          await prisma.paymentWebhookEvent.update({
            where: { id: event.id },
            data: {
              processingStatus: WebhookProcessingStatus.FAILED,
              errorMessage: "Intent has no provider transaction ID",
            },
          });
          continue;
        }

        const adapter = getAdapter(intent.provider);
        const verification = await adapter.verifyCollection(
          intent.providerTransactionId,
        );

        await transactions.run(async (tx) => {
          const txRecord = await tx.paymentTransaction.create({
            data: {
              tenantId: intent.tenantId,
              paymentIntentId: intent.id,
              provider: verification.provider,
              providerTransactionId: verification.providerTransactionId,
              providerReference: verification.providerReference,
              amount: new Prisma.Decimal(verification.amount),
              currency: verification.currency,
              status: verification.status,
              providerStatus: verification.status,
              providerFeeAmount: verification.providerFeeAmount
                ? new Prisma.Decimal(verification.providerFeeAmount)
                : undefined,
              netAmount: verification.netAmount
                ? new Prisma.Decimal(verification.netAmount)
                : undefined,
              verifiedAt: new Date(),
              rawProviderResponse:
                verification.rawResponse as Prisma.InputJsonValue,
            },
          });

          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: { status: verification.status },
          });

          if (
            intent.investmentId &&
            verification.status === PaymentStatus.SUCCEEDED
          ) {
            await tx.investment.update({
              where: { id: intent.investmentId },
              data: { status: "CONFIRMED" as any },
            });
          }

          // Post ledger entries
          if (verification.status === PaymentStatus.SUCCEEDED) {
            await ledger.postCollectionSuccess(tx, intent, txRecord);
          } else if (
            verification.status === PaymentStatus.FAILED ||
            verification.status === PaymentStatus.CANCELLED
          ) {
            await ledger.postReversal(tx, intent);
          }
        });

        await prisma.paymentWebhookEvent.update({
          where: { id: event.id },
          data: {
            processingStatus: WebhookProcessingStatus.PROCESSED,
            processedAt: new Date(),
          },
        });

        await outbox.create(prisma, {
          tenantId: intent.tenantId,
          topic:
            verification.status === PaymentStatus.SUCCEEDED
              ? "payment.collection_succeeded"
              : "payment.collection_failed",
          eventType:
            verification.status === PaymentStatus.SUCCEEDED
              ? "payment.collection_succeeded"
              : "payment.collection_failed",
          aggregateType: "payment_intent",
          aggregateId: intent.id,
          payload: {
            paymentIntentId: intent.id,
            provider: intent.provider,
            amount: verification.amount,
            currency: verification.currency,
            status: verification.status,
          },
        });

        logger.log(
          `Processed webhook event ${event.id} for intent ${intent.id} -> ${verification.status}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        logger.error(`Webhook processing failed for ${event.id}: ${message}`);
        await prisma.paymentWebhookEvent.update({
          where: { id: event.id },
          data: {
            processingStatus: WebhookProcessingStatus.FAILED,
            errorMessage: message,
          },
        });
      }
    }

    await sleep(events.length > 0 ? 500 : 5_000);
  }
}

void bootstrap();
