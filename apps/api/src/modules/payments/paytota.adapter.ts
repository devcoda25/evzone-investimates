import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentProvider, PaymentStatus } from "@prisma/client";
import {
  PaymentProviderAdapter,
  CreateCollectionIntentInput,
  CreateCollectionIntentResult,
  CreatePayoutInput,
  CreatePayoutResult,
  VerificationResult,
} from "./payment-provider.interface";

@Injectable()
export class PaytotaAdapter implements PaymentProviderAdapter {
  private readonly logger = new Logger(PaytotaAdapter.name);
  private readonly baseUrl = "https://api.paytota.com/v1";
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>("PAYTOTA_SECRET_KEY") ?? "";
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/json",
    };
  }

  async createCollectionIntent(
    input: CreateCollectionIntentInput,
  ): Promise<CreateCollectionIntentResult> {
    const payload = {
      reference: input.internalReference,
      amount: input.amount,
      currency: input.currency,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
      customer_name: input.customer.name,
      redirect_url: input.redirectUrl,
      metadata: input.metadata,
    };

    try {
      const res = await fetch(`${this.baseUrl}/collections`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;

      return {
        provider: PaymentProvider.PAYTOTA,
        providerReference: String(data?.id ?? ""),
        providerTransactionId: String(data?.reference ?? ""),
        checkoutUrl: data?.checkout_url as string | undefined,
        status: this.mapStatus(String(data?.status ?? "")),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Paytota collection failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async verifyCollection(
    providerTransactionId: string,
  ): Promise<VerificationResult> {
    try {
      const res = await fetch(
        `${this.baseUrl}/collections/${providerTransactionId}/verify`,
        { headers: this.headers() },
      );
      const json = (await res.json()) as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;

      const amount = Number(data?.amount ?? 0);
      const fee = Number((data?.fee as number) ?? 0);

      return {
        provider: PaymentProvider.PAYTOTA,
        providerTransactionId: String(data?.id ?? providerTransactionId),
        providerReference: String(data?.reference ?? ""),
        amount: amount.toString(),
        currency: String(data?.currency ?? ""),
        status: this.mapStatus(String(data?.status ?? "")),
        providerFeeAmount: fee.toString(),
        netAmount: (amount - fee).toString(),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Paytota verification failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult> {
    const payload = {
      reference: input.internalReference,
      amount: input.amount,
      currency: input.currency,
      destination_type: input.destinationType,
      destination_account: input.destinationAccount,
      destination_bank_code: input.destinationBankCode,
      destination_provider: input.destinationMobileMoneyProvider,
      recipient_name: input.recipientName,
      recipient_email: input.recipientEmail,
      description: input.description,
    };

    try {
      const res = await fetch(`${this.baseUrl}/payouts`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;

      return {
        provider: PaymentProvider.PAYTOTA,
        providerPayoutId: String(data?.id ?? ""),
        providerReference: String(data?.reference ?? ""),
        status: this.mapStatus(String(data?.status ?? "")),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Paytota payout failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async verifyPayout(providerPayoutId: string): Promise<VerificationResult> {
    try {
      const res = await fetch(`${this.baseUrl}/payouts/${providerPayoutId}`, {
        headers: this.headers(),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;

      return {
        provider: PaymentProvider.PAYTOTA,
        providerTransactionId: String(data?.id ?? providerPayoutId),
        providerReference: String(data?.reference ?? ""),
        amount: String(data?.amount ?? "0"),
        currency: String(data?.currency ?? ""),
        status: this.mapStatus(String(data?.status ?? "")),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Paytota payout verification failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async verifyWebhookSignature(
    rawBody: string,
    signature: string,
  ): Promise<boolean> {
    const secret = this.config.get<string>("PAYTOTA_WEBHOOK_SECRET") ?? "";
    if (!secret) return false;

    const crypto = await import("crypto");
    const hash = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return hash === signature;
  }

  private mapStatus(status: string): PaymentStatus {
    const s = status?.toLowerCase() ?? "";
    if (s === "successful" || s === "success" || s === "completed")
      return PaymentStatus.SUCCEEDED;
    if (s === "pending" || s === "queued") return PaymentStatus.PENDING;
    if (s === "processing") return PaymentStatus.PROCESSING;
    if (s === "failed" || s === "error") return PaymentStatus.FAILED;
    if (s === "cancelled" || s === "canceled") return PaymentStatus.CANCELLED;
    if (s === "expired") return PaymentStatus.EXPIRED;
    return PaymentStatus.PENDING;
  }
}
