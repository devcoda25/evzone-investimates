import { PaymentProvider, PaymentStatus } from "@prisma/client";

export type PaymentPurpose =
  | "INVESTMENT_FUNDING"
  | "INVESTOR_TOPUP"
  | "PROJECT_REPAYMENT"
  | "INVESTOR_DISTRIBUTION"
  | "ASSESSOR_FEE"
  | "PLATFORM_FEE"
  | "REFUND";

export interface CreateCollectionIntentInput {
  internalReference: string;
  amount: string;
  currency: string;
  customer: {
    email: string;
    phone?: string;
    name?: string;
    country?: string;
  };
  metadata: Record<string, any>;
  redirectUrl?: string;
}

export interface CreateCollectionIntentResult {
  provider: PaymentProvider;
  providerReference: string;
  providerTransactionId?: string;
  checkoutUrl?: string;
  status: PaymentStatus;
  rawResponse: unknown;
}

export interface CreatePayoutInput {
  internalReference: string;
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
}

export interface CreatePayoutResult {
  provider: PaymentProvider;
  providerPayoutId: string;
  providerReference: string;
  status: PaymentStatus;
  rawResponse: unknown;
}

export interface VerificationResult {
  provider: PaymentProvider;
  providerTransactionId: string;
  providerReference: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  providerFeeAmount?: string;
  netAmount?: string;
  rawResponse: unknown;
  processedAt?: Date;
}

export interface PaymentProviderAdapter {
  createCollectionIntent(
    input: CreateCollectionIntentInput,
  ): Promise<CreateCollectionIntentResult>;
  verifyCollection(
    providerTransactionId: string,
  ): Promise<VerificationResult>;
  createPayout?(input: CreatePayoutInput): Promise<CreatePayoutResult>;
  verifyPayout?(providerPayoutId: string): Promise<VerificationResult>;
  verifyWebhookSignature?(
    rawBody: string,
    signature: string,
  ): Promise<boolean>;
}
