import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  InvestmentStatus,
  PaymentDirection,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  WebhookProcessingStatus,
} from "@prisma/client";
import { AuthenticatedUser } from "@evzone/common";
import { PrismaService, TransactionService } from "@evzone/database";
import { PermissionsService } from "@evzone/permissions";
import { OutboxService } from "@evzone/events";
import {
  PaymentProviderAdapter,
  PaymentPurpose,
  CreateCollectionIntentInput,
  CreatePayoutInput,
} from "./payment-provider.interface";
import { LedgerPostingService } from "./ledger-posting.service";
import {
  ComplianceAlertSeverity,
  ComplianceAlertStatus,
  ComplianceAlertType,
} from "@prisma/client";
import { FlutterwaveAdapter } from "./flutterwave.adapter";
import { PaytotaAdapter } from "./paytota.adapter";

@Injectable()
export class PaymentProviderRouterService {
  constructor(private readonly config: ConfigService) {}

  selectProvider(input: {
    countryCode?: string;
    currency: string;
    direction: PaymentDirection;
    paymentMethod?: string;
  }): PaymentProvider {
    const defaultProvider =
      this.config.get<PaymentProvider>("payment.defaultProvider") ??
      PaymentProvider.FLUTTERWAVE;

    // Country/currency specific routing
    if (
      input.countryCode === "UG" &&
      input.currency === "UGX" &&
      input.paymentMethod === "mobile_money"
    ) {
      return PaymentProvider.PAYTOTA;
    }

    if (
      input.countryCode === "NG" &&
      input.currency === "NGN" &&
      input.paymentMethod === "mobile_money"
    ) {
      return PaymentProvider.FLUTTERWAVE;
    }

    return defaultProvider;
  }
}

@Injectable()
export class PaymentIntentsService {
  private readonly logger = new Logger(PaymentIntentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly router: PaymentProviderRouterService,
    private readonly flutterwave: FlutterwaveAdapter,
    private readonly paytota: PaytotaAdapter,
    private readonly permissions: PermissionsService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    private readonly ledger: LedgerPostingService,
  ) {}

  private getAdapter(provider: PaymentProvider): PaymentProviderAdapter {
    switch (provider) {
      case PaymentProvider.FLUTTERWAVE:
        return this.flutterwave;
      case PaymentProvider.PAYTOTA:
        return this.paytota;
      default:
        throw new BadRequestException(`Unknown payment provider: ${String(provider)}`);
    }
  }

  async createCollectionIntent(
    input: {
      amount: string;
      currency: string;
      customerEmail: string;
      customerPhone?: string;
      customerName?: string;
      customerCountry?: string;
      investmentId?: string;
      dealId?: string;
      purpose: PaymentPurpose;
      tenantId: string;
      userId: string;
      redirectUrl?: string;
      paymentMethod?: string;
    },
  ): Promise<unknown> {
    const internalReference = `pi_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const provider = this.router.selectProvider({
      countryCode: input.customerCountry,
      currency: input.currency,
      direction: PaymentDirection.COLLECTION,
      paymentMethod: input.paymentMethod,
    });

    const providerInput: CreateCollectionIntentInput = {
      internalReference,
      amount: input.amount,
      currency: input.currency,
      customer: {
        email: input.customerEmail,
        phone: input.customerPhone,
        name: input.customerName,
        country: input.customerCountry,
      },
      metadata: {
        tenantId: input.tenantId,
        investorUserId: input.userId,
        dealId: input.dealId,
        investmentId: input.investmentId,
        purpose: input.purpose,
      },
      redirectUrl:
        input.redirectUrl ??
        this.config.get<string>("payment.callbackBaseUrl"),
    };

    const adapter = this.getAdapter(provider);
    const result = await adapter.createCollectionIntent(providerInput);

    const intent = await this.prisma.paymentIntent.create({
      data: {
        tenantId: input.tenantId,
        investmentId: input.investmentId,
        dealId: input.dealId,
        userId: input.userId,
        provider: result.provider,
        direction: PaymentDirection.COLLECTION,
        purpose: input.purpose,
        internalReference,
        providerReference: result.providerReference,
        providerTransactionId: result.providerTransactionId,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
        status: result.status,
        checkoutUrl: result.checkoutUrl,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
        rawProviderResponse: result.rawResponse as Prisma.InputJsonValue,
      },
    });

    await this.outbox.create(this.prisma, {
      tenantId: input.tenantId,
      topic: "payment.intent_created",
      eventType: "payment.intent_created",
      aggregateType: "payment_intent",
      aggregateId: intent.id,
      payload: {
        paymentIntentId: intent.id,
        provider: intent.provider,
        amount: input.amount,
        currency: input.currency,
      },
    });

    return {
      id: intent.id,
      internalReference: intent.internalReference,
      provider: intent.provider,
      status: intent.status,
      checkoutUrl: intent.checkoutUrl,
      amount: intent.amount.toString(),
      currency: intent.currency,
      expiresAt: intent.expiresAt,
    };
  }

  async findIntentById(id: string, user: AuthenticatedUser): Promise<unknown> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id },
      include: { transactions: true },
    });
    if (!intent) throw new NotFoundException("Payment intent not found");
    this.permissions.assertTenantAccess(user, intent.tenantId);
    if (intent.userId !== user.id && !this.permissions.isPlatformAdmin(user)) {
      throw new BadRequestException("You can only view your own payment intents");
    }
    return intent;
  }

  async verifyAndUpdateIntent(
    paymentIntentId: string,
  ): Promise<unknown> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
    });
    if (!intent) throw new NotFoundException("Payment intent not found");
    if (!intent.providerTransactionId) {
      throw new BadRequestException("No provider transaction to verify");
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
          rawProviderResponse: verification.rawResponse as Prisma.InputJsonValue,
        },
      });

      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: verification.status },
      });

      if (intent.investmentId && verification.status === PaymentStatus.SUCCEEDED) {
        await tx.investment.update({
          where: { id: intent.investmentId },
          data: { status: InvestmentStatus.CONFIRMED },
        });
      }

      // Post ledger entries
      if (verification.status === PaymentStatus.SUCCEEDED) {
        await this.ledger.postCollectionSuccess(tx, intent, txRecord);
      } else if (
        verification.status === PaymentStatus.FAILED ||
        verification.status === PaymentStatus.CANCELLED
      ) {
        await this.ledger.postReversal(tx, intent);
      }

      return txRecord;
    });

    return {
      intentId: intent.id,
      status: verification.status,
      amount: verification.amount,
      currency: verification.currency,
      providerFee: verification.providerFeeAmount,
      netAmount: verification.netAmount,
    };
  }
}

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly router: PaymentProviderRouterService,
    private readonly flutterwave: FlutterwaveAdapter,
    private readonly paytota: PaytotaAdapter,
    private readonly permissions: PermissionsService,
  ) {}

  private getAdapter(provider: PaymentProvider): PaymentProviderAdapter {
    switch (provider) {
      case PaymentProvider.FLUTTERWAVE:
        return this.flutterwave;
      case PaymentProvider.PAYTOTA:
        return this.paytota;
      default:
        throw new BadRequestException(`Unknown payment provider: ${String(provider)}`);
    }
  }

  async createPayout(
    input: {
      tenantId: string;
      userId?: string;
      organizationId?: string;
      amount: string;
      currency: string;
      destinationType: "BANK_ACCOUNT" | "MOBILE_MONEY" | "WALLET";
      destinationAccount: string;
      destinationBankCode?: string;
      destinationMobileMoneyProvider?: string;
      recipientName: string;
      recipientEmail?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    const internalReference = `po_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const provider = this.router.selectProvider({
      currency: input.currency,
      direction: PaymentDirection.PAYOUT,
    });

    const providerInput: CreatePayoutInput = {
      internalReference,
      amount: input.amount,
      currency: input.currency,
      destinationType: input.destinationType,
      destinationAccount: input.destinationAccount,
      destinationBankCode: input.destinationBankCode,
      destinationMobileMoneyProvider: input.destinationMobileMoneyProvider,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
      description: input.description,
      metadata: input.metadata ?? {},
    };

    const adapter = this.getAdapter(provider);
    if (!adapter.createPayout) {
      throw new BadRequestException(`${provider} does not support payouts`);
    }

    const result = await adapter.createPayout(providerInput);

    const payout = await this.prisma.payout.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        organizationId: input.organizationId,
        provider: result.provider,
        internalReference,
        providerPayoutId: result.providerPayoutId,
        providerReference: result.providerReference,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
        destinationType: input.destinationType,
        destinationMasked: this.maskDestination(input.destinationAccount),
        status: result.status,
        rawProviderResponse: result.rawResponse as Prisma.InputJsonValue,
      },
    });

    return {
      id: payout.id,
      internalReference: payout.internalReference,
      provider: payout.provider,
      status: payout.status,
      amount: payout.amount.toString(),
      currency: payout.currency,
      destinationMasked: payout.destinationMasked,
    };
  }

  async findPayouts(
    tenantId: string,
    status?: PaymentStatus,
  ): Promise<unknown[]> {
    return this.prisma.payout.findMany({
      where: { tenantId, status },
      orderBy: { createdAt: "desc" },
    });
  }

  async verifyPayout(payoutId: string): Promise<unknown> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException("Payout not found");
    if (!payout.providerPayoutId) {
      throw new BadRequestException("No provider payout ID to verify");
    }

    const adapter = this.getAdapter(payout.provider);
    if (!adapter.verifyPayout) {
      throw new BadRequestException(`${payout.provider} does not support payout verification`);
    }

    const verification = await adapter.verifyPayout(payout.providerPayoutId);

    await this.prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: verification.status,
        rawProviderResponse: verification.rawResponse as Prisma.InputJsonValue,
      },
    });

    return {
      payoutId: payout.id,
      status: verification.status,
      amount: verification.amount,
      currency: verification.currency,
      processedAt: verification.processedAt,
    };
  }

  private maskDestination(account: string): string {
    if (account.length <= 4) return "****";
    return "****" + account.slice(-4);
  }
}

@Injectable()
export class PaymentWebhooksService {
  private readonly logger = new Logger(PaymentWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwave: FlutterwaveAdapter,
    private readonly paytota: PaytotaAdapter,
    private readonly outbox: OutboxService,
  ) {}

  async processWebhook(
    provider: PaymentProvider,
    rawBody: string,
    signature: string | undefined,
  ): Promise<{ id: string; accepted: boolean }> {
    // 1. Verify signature
    const verified = await this.verifySignature(provider, rawBody, signature);

    // 2. Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new BadRequestException("Invalid webhook JSON payload");
    }

    const providerEventId = this.extractEventId(provider, payload);

    // 3. Store webhook event
    const event = await this.prisma.paymentWebhookEvent.create({
      data: {
        provider,
        providerEventId: providerEventId ?? undefined,
        eventType: this.extractEventType(provider, payload),
        signature: signature ?? null,
        rawBody,
        payload: payload as Prisma.InputJsonValue,
        processingStatus: verified
          ? WebhookProcessingStatus.PENDING
          : WebhookProcessingStatus.FAILED,
        errorMessage: verified ? null : "Signature verification failed",
      },
    });

    if (!verified) {
      this.logger.warn(
        `Webhook signature verification failed for ${provider} event ${event.id}`,
      );
      return { id: event.id, accepted: false };
    }

    // 4. Emit outbox event for async worker processing
    const intentRef = this.extractIntentRef(provider, payload);
    await this.outbox.create(this.prisma, {
      tenantId: "platform",
      topic: "payment.webhook.received",
      eventType: "payment.webhook.received",
      aggregateType: "payment_webhook",
      aggregateId: event.id,
      payload: {
        webhookEventId: event.id,
        provider,
        eventType: event.eventType,
        intentRef,
      },
    });

    return { id: event.id, accepted: true };
  }

  private async verifySignature(
    provider: PaymentProvider,
    rawBody: string,
    signature: string | undefined,
  ): Promise<boolean> {
    if (!signature) {
      this.logger.warn(`Missing webhook signature for ${provider}`);
      return false;
    }

    const adapter =
      provider === PaymentProvider.FLUTTERWAVE
        ? this.flutterwave
        : this.paytota;

    if (!adapter.verifyWebhookSignature) {
      this.logger.warn(`No webhook signature verifier for ${provider}`);
      return false;
    }

    return adapter.verifyWebhookSignature(rawBody, signature);
  }

  private extractEventId(
    provider: PaymentProvider,
    payload: Record<string, unknown>,
  ): string | null {
    if (provider === PaymentProvider.FLUTTERWAVE) {
      return (payload.id as string) ?? null;
    }
    if (provider === PaymentProvider.PAYTOTA) {
      return (payload.id as string) ?? null;
    }
    return null;
  }

  private extractEventType(
    provider: PaymentProvider,
    payload: Record<string, unknown>,
  ): string {
    if (provider === PaymentProvider.FLUTTERWAVE) {
      return (payload.event as string) ?? "unknown";
    }
    if (provider === PaymentProvider.PAYTOTA) {
      return (payload.event_type as string) ?? "unknown";
    }
    return "unknown";
  }

  private extractIntentRef(
    provider: PaymentProvider,
    payload: Record<string, unknown>,
  ): string | null {
    if (provider === PaymentProvider.FLUTTERWAVE) {
      return (payload.data as Record<string, unknown>)?.tx_ref as string ?? null;
    }
    if (provider === PaymentProvider.PAYTOTA) {
      return (payload.reference as string) ??
        (payload.data as Record<string, unknown>)?.reference as string ?? null;
    }
    return null;
  }
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwave: FlutterwaveAdapter,
    private readonly paytota: PaytotaAdapter,
    private readonly ledger: LedgerPostingService,
  ) {}

  async runReconciliation(
    tenantId: string,
    provider: PaymentProvider,
    startDate: Date,
    endDate: Date,
  ): Promise<unknown> {
    this.logger.log(
      `Starting reconciliation for ${provider} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    const pendingIntents = await this.prisma.paymentIntent.findMany({
      where: {
        tenantId,
        provider,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: { transactions: true },
    });

    const results = {
      checked: pendingIntents.length,
      updated: 0,
      failed: 0,
      discrepancies: [] as Array<{
        intentId: string;
        providerAmount: string;
        ledgerAmount: string;
        difference: string;
      }>,
      details: [] as Array<{
        intentId: string;
        oldStatus: PaymentStatus;
        newStatus: PaymentStatus;
      }>,
    };

    for (const intent of pendingIntents) {
      if (!intent.providerTransactionId) continue;
      try {
        const adapter =
          provider === PaymentProvider.FLUTTERWAVE
            ? this.flutterwave
            : this.paytota;
        const verification = await adapter.verifyCollection(
          intent.providerTransactionId,
        );

        if (verification.status !== intent.status) {
          await this.prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { status: verification.status },
          });
          await this.prisma.paymentTransaction.create({
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
              verifiedAt: new Date(),
              rawProviderResponse:
                verification.rawResponse as Prisma.InputJsonValue,
            },
          });
          results.updated++;
          results.details.push({
            intentId: intent.id,
            oldStatus: intent.status,
            newStatus: verification.status,
          });
        }

        // Check ledger discrepancy for succeeded intents
        if (verification.status === PaymentStatus.SUCCEEDED) {
          const ledgerSum = await this.prisma.ledgerEntry.aggregate({
            where: { transactionId: intent.id },
            _sum: { amount: true },
          });
          const providerAmount = new Prisma.Decimal(verification.amount);
          const ledgerAmount = new Prisma.Decimal(ledgerSum._sum.amount ?? 0);
          const diff = providerAmount.minus(ledgerAmount).abs();

          if (diff.greaterThan(0.01)) {
            results.discrepancies.push({
              intentId: intent.id,
              providerAmount: providerAmount.toString(),
              ledgerAmount: ledgerAmount.toString(),
              difference: diff.toString(),
            });
            await this.prisma.complianceAlert.create({
              data: {
                tenantId: intent.tenantId,
                type: ComplianceAlertType.REGULATORY_CHANGE,
                severity: ComplianceAlertSeverity.MEDIUM,
                status: ComplianceAlertStatus.OPEN,
                entityType: "payment_intent",
                entityId: intent.id,
                title: "Ledger Reconciliation Discrepancy",
                description: `Provider amount ${providerAmount.toString()} vs ledger sum ${ledgerAmount.toString()} (diff: ${diff.toString()}) for intent ${intent.id}`,
              },
            });
          }
        }
      } catch (err) {
        this.logger.error(
          `Reconciliation failed for intent ${intent.id}: ${(err as Error).message}`,
        );
        results.failed++;
      }
    }

    this.logger.log(
      `Reconciliation complete: ${results.updated} updated, ${results.failed} failed, ${results.discrepancies.length} discrepancies`,
    );
    return results;
  }

  async runDailyReconciliation(
    tenantId: string,
    provider: PaymentProvider,
  ): Promise<unknown> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    return this.runReconciliation(tenantId, provider, yesterday, today);
  }
}
