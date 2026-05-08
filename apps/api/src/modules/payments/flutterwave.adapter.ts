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
export class FlutterwaveAdapter implements PaymentProviderAdapter {
  private readonly logger = new Logger(FlutterwaveAdapter.name);
  private readonly baseUrl = "https://api.flutterwave.com/v3";
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>("FLUTTERWAVE_SECRET_KEY") ?? "";
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
      tx_ref: input.internalReference,
      amount: input.amount,
      currency: input.currency,
      redirect_url: input.redirectUrl,
      customer: {
        email: input.customer.email,
        phonenumber: input.customer.phone,
        name: input.customer.name,
      },
      meta: input.metadata,
    };

    try {
      const res = await fetch(`${this.baseUrl}/payments`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;

      return {
        provider: PaymentProvider.FLUTTERWAVE,
        providerReference: String(data?.id ?? ""),
        providerTransactionId: String(data?.tx_ref ?? ""),
        checkoutUrl: data?.link as string | undefined,
        status: this.mapStatus(String(data?.status ?? "")),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Flutterwave collection failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async verifyCollection(
    providerTransactionId: string,
  ): Promise<VerificationResult> {
    try {
      const res = await fetch(
        `${this.baseUrl}/transactions/${providerTransactionId}/verify`,
        { headers: this.headers() },
      );
      const json = (await res.json()) as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;

      const amount = Number(data?.amount ?? 0);
      const fee = Number((data?.app_fee as number) ?? 0);

      return {
        provider: PaymentProvider.FLUTTERWAVE,
        providerTransactionId: String(data?.id ?? providerTransactionId),
        providerReference: String(data?.tx_ref ?? ""),
        amount: amount.toString(),
        currency: String(data?.currency ?? ""),
        status: this.mapStatus(String(data?.status ?? "")),
        providerFeeAmount: fee.toString(),
        netAmount: (amount - fee).toString(),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Flutterwave verification failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult> {
    const payload = {
      account_bank: input.destinationBankCode,
      account_number: input.destinationAccount,
      amount: input.amount,
      currency: input.currency,
      narration: input.description,
      reference: input.internalReference,
      callback_url: (input.metadata?.callback_url as string) ?? undefined,
      debit_currency: input.currency,
    };

    try {
      const res = await fetch(`${this.baseUrl}/transfers`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;

      return {
        provider: PaymentProvider.FLUTTERWAVE,
        providerPayoutId: String(data?.id ?? ""),
        providerReference: String(data?.reference ?? ""),
        status: this.mapStatus(String(data?.status ?? "")),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Flutterwave payout failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async verifyPayout(providerPayoutId: string): Promise<VerificationResult> {
    try {
      const res = await fetch(`${this.baseUrl}/transfers/${providerPayoutId}`, {
        headers: this.headers(),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;

      return {
        provider: PaymentProvider.FLUTTERWAVE,
        providerTransactionId: String(data?.id ?? providerPayoutId),
        providerReference: String(data?.reference ?? ""),
        amount: String(data?.amount ?? "0"),
        currency: String(data?.currency ?? ""),
        status: this.mapStatus(String(data?.status ?? "")),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Flutterwave payout verification failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async verifyWebhookSignature(
    rawBody: string,
    signature: string,
  ): Promise<boolean> {
    const secretHash =
      this.config.get<string>("FLUTTERWAVE_WEBHOOK_HASH") ?? "";
    if (!secretHash) return false;

    const crypto = await import("crypto");
    const hash = crypto
      .createHmac("sha256", secretHash)
      .update(rawBody)
      .digest("hex");
    return hash === signature;
  }

  private mapStatus(status: string): PaymentStatus {
    const s = status?.toLowerCase() ?? "";
    if (s === "successful" || s === "success") return PaymentStatus.SUCCEEDED;
    if (s === "pending") return PaymentStatus.PENDING;
    if (s === "processing") return PaymentStatus.PROCESSING;
    if (s === "failed") return PaymentStatus.FAILED;
    if (s === "cancelled") return PaymentStatus.CANCELLED;
    if (s === "expired") return PaymentStatus.EXPIRED;
    return PaymentStatus.PENDING;
  }
}
