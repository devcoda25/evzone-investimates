import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "@evzone/database";
import { OutboxService } from "@evzone/events";
import { AuditService } from "@evzone/audit";
import { RedisService } from "@evzone/redis";
import { KafkaConsumerService } from "@evzone/events";
import { Prisma, TransactionStatus } from "@prisma/client";

@Injectable()
export class PaymentReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  onModuleInit(): void {
    this.consumePaymentEvents();
  }

  private consumePaymentEvents(): void {
    this.kafkaConsumer.consume("payment.confirmed", async (message) => {
      const { paymentIntentId, providerReference, amount, currency } = JSON.parse(
        message.value.toString(),
      );
      await this.reconcilePayment(paymentIntentId, providerReference, amount, currency);
    });

    this.kafkaConsumer.consume("payment.failed", async (message) => {
      const { paymentIntentId, error } = JSON.parse(message.value.toString());
      await this.handleFailedPayment(paymentIntentId, error);
    });
  }

  /**
   * Reconcile a confirmed payment with the internal ledger.
   */
  async reconcilePayment(
    paymentIntentId: string,
    providerReference: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Find the payment intent
      const paymentIntent = await tx.paymentIntent.findUnique({
        where: { id: paymentIntentId },
        include: { transactions: true },
      });

      if (!paymentIntent) {
        this.logger.error(`Payment intent not found: ${paymentIntentId}`);
        return;
      }

      // Update payment intent status
      await tx.paymentIntent.update({
        where: { id: paymentIntentId },
        data: {
          status: "SUCCEEDED",
          providerReference,
          updatedAt: new Date(),
        },
      });

      // Update related transactions
      for (const transaction of paymentIntent.transactions) {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.COMPLETED,
            providerTransactionId: providerReference,
            processedAt: new Date(),
          },
        });
      }

      // Post ledger entries
      if (paymentIntent.investmentId) {
        await this.postLedgerEntries(tx, paymentIntent, amount, currency);
      }

      // Emit reconciliation event
      await this.outbox.create(tx, {
        tenantId: paymentIntent.tenantId,
        topic: "payment.reconciled",
        eventType: "payment.reconciled",
        aggregateType: "payment",
        aggregateId: paymentIntentId,
        payload: {
          paymentIntentId,
          providerReference,
          amount,
          currency,
        },
      });

      // Audit log
      await this.audit.record({
        tenantId: paymentIntent.tenantId,
        userId: paymentIntent.userId ?? undefined,
        action: "payment.reconciled",
        entityType: "payment",
        entityId: paymentIntentId,
        metadata: {
          providerReference,
          amount,
          currency,
          investmentId: paymentIntent.investmentId ?? undefined,
        },
      });

      this.logger.log(`Payment reconciled: ${paymentIntentId}`);
    });
  }

  /**
   * Handle a failed payment.
   */
  async handleFailedPayment(paymentIntentId: string, error: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const paymentIntent = await tx.paymentIntent.findUnique({
        where: { id: paymentIntentId },
      });

      if (!paymentIntent) {
        this.logger.error(`Payment intent not found for failed payment: ${paymentIntentId}`);
        return;
      }

      await tx.paymentIntent.update({
        where: { id: paymentIntentId },
        data: {
          status: "FAILED",
          updatedAt: new Date(),
          rawProviderResponse: error,
        },
      });

      // Update related transactions
      await tx.transaction.updateMany({
        where: { investmentId: paymentIntent.investmentId, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.FAILED },
      });

      // Emit failure event
      await this.outbox.create(tx, {
        tenantId: paymentIntent.tenantId,
        topic: "payment.failed",
        eventType: "payment.failed",
        aggregateType: "payment",
        aggregateId: paymentIntentId,
        payload: { paymentIntentId, error },
      });

      // Audit log
      await this.audit.record({
        tenantId: paymentIntent.tenantId,
        userId: paymentIntent.userId ?? undefined,
        action: "payment.failed",
        entityType: "payment",
        entityId: paymentIntentId,
        metadata: { error },
      });

      this.logger.warn(`Payment failed: ${paymentIntentId} - ${error}`);
    });
  }

  /**
   * Post ledger entries for a reconciled payment.
   */
  private async postLedgerEntries(
    tx: Prisma.TransactionClient,
    paymentIntent: any,
    amount: number,
    currency: string,
  ): Promise<void> {
    // Find or create escrow account
    const escrowAccount = await tx.ledgerAccount.upsert({
      where: {
        tenantId_ownerType_ownerId_currency_name: {
          tenantId: paymentIntent.tenantId,
          ownerType: "PROJECT",
          ownerId: paymentIntent.investmentId ?? "",
          currency,
          name: "Escrow Liability",
        },
      },
      create: {
        tenantId: paymentIntent.tenantId,
        ownerType: "PROJECT",
        ownerId: paymentIntent.investmentId ?? "",
        currency,
        name: "Escrow Liability",
      },
      update: {},
    });

    // Find or create project funding balance account
    const fundingAccount = await tx.ledgerAccount.upsert({
      where: {
        tenantId_ownerType_ownerId_currency_name: {
          tenantId: paymentIntent.tenantId,
          ownerType: "PROJECT",
          ownerId: paymentIntent.investmentId ?? "",
          currency,
          name: "Project Funding Balance",
        },
      },
      create: {
        tenantId: paymentIntent.tenantId,
        ownerType: "PROJECT",
        ownerId: paymentIntent.investmentId ?? "",
        currency,
        name: "Project Funding Balance",
      },
      update: {},
    });

    // Double-entry: Debit Escrow Liability, Credit Project Funding Balance
    await tx.ledgerEntry.createMany({
      data: [
        {
          tenantId: paymentIntent.tenantId,
          accountId: escrowAccount.id,
          transactionId: paymentIntent.transactions[0]?.id ?? "",
          direction: "DEBIT",
          amount,
          currency,
          memo: "Payment reconciled - escrow release",
        },
        {
          tenantId: paymentIntent.tenantId,
          accountId: fundingAccount.id,
          transactionId: paymentIntent.transactions[0]?.id ?? "",
          direction: "CREDIT",
          amount,
          currency,
          memo: "Payment reconciled - funding balance",
        },
      ],
    });
  }

  /**
   * Periodic reconciliation check for pending payments.
   */
  async reconcilePendingPayments(): Promise<void> {
    const pendingPayments = await this.prisma.paymentIntent.findMany({
      where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } },
      include: { transactions: true },
    });

    for (const payment of pendingPayments) {
      this.logger.warn(`Found stale pending payment: ${payment.id}`);
      // Mark as failed if pending for too long
      await this.handleFailedPayment(payment.id, "Payment timeout - no confirmation received");
    }
  }
}