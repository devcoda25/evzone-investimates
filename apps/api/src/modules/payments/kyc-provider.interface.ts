import { KycProvider } from "@prisma/client";

export interface SubmitIdentityInput {
  reference: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  countryCode: string;
  idType: string;
  idNumber: string;
  selfieImage?: string; // base64 or URL
  idImageFront?: string;
  idImageBack?: string;
  callbackUrl?: string;
}

export interface SubmitIdentityResult {
  provider: KycProvider;
  providerReference: string;
  status: string;
  rawResponse: unknown;
}

export interface VerifyBusinessInput {
  reference: string;
  organizationName: string;
  registrationNumber: string;
  jurisdiction: string;
  incorporationDate?: string;
  directors: Array<{
    name: string;
    idNumber?: string;
    nationality?: string;
  }>;
  callbackUrl?: string;
}

export interface VerifyBusinessResult {
  provider: KycProvider;
  providerReference: string;
  status: string;
  rawResponse: unknown;
}

export interface KycProviderAdapter {
  submitIdentity(input: SubmitIdentityInput): Promise<SubmitIdentityResult>;
  verifyBusiness?(input: VerifyBusinessInput): Promise<VerifyBusinessResult>;
  verifyWebhookSignature?(
    rawBody: string,
    signature: string,
  ): Promise<boolean>;
}
