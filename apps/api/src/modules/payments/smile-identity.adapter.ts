import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KycProvider } from "@prisma/client";
import {
  KycProviderAdapter,
  SubmitIdentityInput,
  SubmitIdentityResult,
  VerifyBusinessInput,
  VerifyBusinessResult,
} from "./kyc-provider.interface";

@Injectable()
export class SmileIdentityAdapter implements KycProviderAdapter {
  private readonly logger = new Logger(SmileIdentityAdapter.name);
  private readonly baseUrl = "https://api.smileidentity.com/v1";
  private readonly apiKey: string;
  private readonly partnerId: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>("SMILE_IDENTITY_API_KEY") ?? "";
    this.partnerId = this.config.get<string>("SMILE_IDENTITY_PARTNER_ID") ?? "";
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async submitIdentity(
    input: SubmitIdentityInput,
  ): Promise<SubmitIdentityResult> {
    const payload = {
      partner_id: this.partnerId,
      source_sdk: "evzone_api",
      source_sdk_version: "1.0.0",
      callback_url: input.callbackUrl,
      user_id: input.userId,
      job_type: 5, // Enhanced KYC
      job_id: input.reference,
      country: input.countryCode,
      id_type: input.idType,
      id_number: input.idNumber,
      first_name: input.firstName,
      last_name: input.lastName,
      phone_number: input.phone,
      email: input.email,
      images: [
        ...(input.selfieImage
          ? [{ image_type_id: 2, image: input.selfieImage }]
          : []),
        ...(input.idImageFront
          ? [{ image_type_id: 0, image: input.idImageFront }]
          : []),
        ...(input.idImageBack
          ? [{ image_type_id: 1, image: input.idImageBack }]
          : []),
      ],
    };

    try {
      const res = await fetch(`${this.baseUrl}/id_verification`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as Record<string, unknown>;

      return {
        provider: KycProvider.SMILE_IDENTITY,
        providerReference: String(json?.job_id ?? input.reference),
        status: this.mapStatus(json),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Smile Identity submission failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async verifyBusiness(
    input: VerifyBusinessInput,
  ): Promise<VerifyBusinessResult> {
    const payload = {
      partner_id: this.partnerId,
      source_sdk: "evzone_api",
      source_sdk_version: "1.0.0",
      callback_url: input.callbackUrl,
      job_type: 7, // Business verification
      job_id: input.reference,
      country: input.jurisdiction,
      business_type: "company",
      business_name: input.organizationName,
      registration_number: input.registrationNumber,
      incorporation_date: input.incorporationDate,
      directors: input.directors,
    };

    try {
      const res = await fetch(`${this.baseUrl}/business_verification`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as Record<string, unknown>;

      return {
        provider: KycProvider.SMILE_IDENTITY,
        providerReference: String(json?.job_id ?? input.reference),
        status: this.mapStatus(json),
        rawResponse: json,
      };
    } catch (err) {
      this.logger.error(
        `Smile Identity business verification failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async verifyWebhookSignature(
    rawBody: string,
    signature: string,
  ): Promise<boolean> {
    const secret = this.config.get<string>("SMILE_IDENTITY_WEBHOOK_SECRET") ?? "";
    if (!secret) return false;

    const crypto = await import("crypto");
    const hash = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return hash === signature;
  }

  private mapStatus(response: Record<string, unknown>): string {
    const result = (response.result as Record<string, unknown>) ?? response;
    const text = String(result?.ResultText ?? result?.status ?? "pending");
    const lower = text.toLowerCase();
    if (lower.includes("success") || lower.includes("verified"))
      return "VERIFIED";
    if (lower.includes("fail") || lower.includes("rejected"))
      return "REJECTED";
    if (lower.includes("process")) return "PROCESSING";
    return "PENDING";
  }
}
