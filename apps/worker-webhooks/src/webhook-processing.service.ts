import { Injectable, Logger } from "@nestjs/common";
import {
  InvestmentStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  WebhookProcessingStatus,
} from "@prisma/client";
import { OutboxService } from "@evzone/events";
import { PrismaService, TransactionService } from "@evzone/database";
import { FlutterwaveAdapter } from "../../api/src/modules/payments/flutterwave.adapter";
import { LedgerPostingService } from "../../api/src/modules/payments/ledger-posting.service";
import { PaytotaAdapter } from "../../api/src/modules/payments/paytota.adapter";

@Injectable()
export class WebhookProcessingService {
  private readonly logger = new Logger(WebhookProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly outbox: OutboxService,
    private readonly flutterwave: FlutterwaveAdapter,
    private readonly paytota: PaytotaAdapter,
    private readonly ledger: LedgerPostingService,
  ) {}

  async processPendingBatch(limit = 25): Promise<number> {
    const events = await this.prisma.paymentWebhookEvent.findMany({
      where: { processingStatus: WebhookProcessingStatus.PENDING },
      take: limit,
      orderBy: { createdAt: "asc" },
    });

    for (const event of events) {
      await this.processEvent(event);
    }

    return events.length;
  }

  async processEvent(event: {
    id: string;
    provider: PaymentProvider;
    payload: Prisma.JsonValue;
  }): Promise<void> {
    try {
      const payload = event.payload as Record<string, unknown>;
      const intentRef = this.extractIntentRef(event.provider, payload);

      if (!intentRef) {
        await this.markWebhookFailed(
          event.id,
          "No intent reference found in payload",
        );
        return;
      }

      const intent = await this.prisma.paymentIntent.findUnique({
        where: { internalReference: intentRef },
      });
      if (!intent) {
        await this.markWebhookFailed(
          event.id,
          `No payment intent found for ref ${intentRef}`,
        );
        return;
      }

      if (!intent.providerTransactionId) {
        await this.markWebhookFailed(
          event.id,
          "Intent has no provider transaction ID",
        );
        return;
      }

      const adapter = this.getAdapter(intent.provider);
      const verification = await adapter.verifyCollection(
        intent.providerTransactionId,
      );

      await this.transactions.run(async (tx) => {
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
            data: { status: InvestmentStatus.CONFIRMED },
          });
        }

        if (verification.status === PaymentStatus.SUCCEEDED) {
          await this.ledger.postCollectionSuccess(tx, intent, txRecord);
        } else if (
          verification.status === PaymentStatus.FAILED ||
          verification.status === PaymentStatus.CANCELLED
        ) {
          await this.ledger.postReversal(tx, intent);
        }
      });

      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: {
          processingStatus: WebhookProcessingStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      await this.outbox.create(this.prisma, {
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

      this.logger.log(
        `Processed webhook event ${event.id} for intent ${intent.id} -> ${verification.status}`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown processing error";
      this.logger.error(`Webhook processing failed for ${event.id}: ${message}`);
      await this.markWebhookFailed(event.id, message);
    }
  }

  private getAdapter(provider: PaymentProvider) {
    switch (provider) {
      case PaymentProvider.FLUTTERWAVE:
        return this.flutterwave;
      case PaymentProvider.PAYTOTA:
        return this.paytota;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private extractIntentRef(
    provider: PaymentProvider,
    payload: Record<string, unknown>,
  ): string | null {
    if (provider === PaymentProvider.FLUTTERWAVE) {
      return (
        ((payload.data as Record<string, unknown> | undefined)?.tx_ref as
          | string
          | undefined) ?? null
      );
    }

    if (provider === PaymentProvider.PAYTOTA) {
      return (
        (payload.reference as string | undefined) ??
        ((payload.data as Record<string, unknown> | undefined)?.reference as
          | string
          | undefined) ??
        null
      );
    }

    return null;
  }

  private async markWebhookFailed(
    id: string,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.paymentWebhookEvent.update({
      where: { id },
      data: {
        processingStatus: WebhookProcessingStatus.FAILED,
        errorMessage,
      },
    });
  }
}
