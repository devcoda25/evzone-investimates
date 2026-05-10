import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  ComplianceAlertSeverity,
  ComplianceAlertStatus,
  ComplianceAlertType,
  IdDocumentType,
  KycApplicationStatus,
  KycProvider,
  KycStatus,
  Prisma,
} from "@prisma/client";
import { AuthenticatedUser } from "@evzone/common";
import { PrismaService, TransactionService } from "@evzone/database";
import { PermissionsService } from "@evzone/permissions";
import { OutboxService } from "@evzone/events";
import { SmileIdentityAdapter } from "./smile-identity.adapter";

@Injectable()
export class KycKybService {
  private readonly logger = new Logger(KycKybService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly smileIdentity: SmileIdentityAdapter,
    private readonly permissions: PermissionsService,
    private readonly outbox: OutboxService,
  ) {}

  private getKycAdapter(provider: KycProvider): SmileIdentityAdapter {
    switch (provider) {
      case KycProvider.SMILE_IDENTITY:
        return this.smileIdentity;
      case KycProvider.GENERIC:
      case KycProvider.ONFIDO:
        throw new BadRequestException(
          `${provider} KYC adapter not implemented`,
        );
      default:
        throw new BadRequestException(
          `Unknown KYC provider: ${String(provider)}`,
        );
    }
  }

  async submitKyc(
    userId: string,
    tenantId: string,
    input: {
      provider?: KycProvider;
      idType: string;
      idNumber: string;
      idExpiryDate?: string;
      nationality?: string;
      dateOfBirth?: string;
      selfieImage?: string;
      idImageFront?: string;
      idImageBack?: string;
    },
  ): Promise<unknown> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const provider = input.provider ?? KycProvider.SMILE_IDENTITY;
    const reference = `kyc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Create application record first
    const application = await this.prisma.kycApplication.create({
      data: {
        tenantId,
        userId,
        provider,
        providerReference: reference,
        status: KycApplicationStatus.PENDING,
        idType: input.idType as IdDocumentType,
        idNumber: input.idNumber,
        idExpiryDate: input.idExpiryDate
          ? new Date(input.idExpiryDate)
          : undefined,
        nationality: input.nationality,
        dateOfBirth: input.dateOfBirth
          ? new Date(input.dateOfBirth)
          : undefined,
        submittedData: {
          reference,
          idType: input.idType,
          idNumber: input.idNumber,
          hasSelfie: !!input.selfieImage,
          hasIdFront: !!input.idImageFront,
          hasIdBack: !!input.idImageBack,
        } as Prisma.InputJsonValue,
      },
    });

    const adapter = this.getKycAdapter(provider);
    const result = await adapter.submitIdentity({
      reference,
      userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? undefined,
      countryCode: user.countryCode ?? "UG",
      idType: input.idType,
      idNumber: input.idNumber,
      selfieImage: input.selfieImage,
      idImageFront: input.idImageFront,
      idImageBack: input.idImageBack,
    });

    await this.prisma.kycApplication.update({
      where: { id: application.id },
      data: {
        providerReference: result.providerReference,
        status: this.mapProviderStatus(result.status),
        providerResult: result.rawResponse as Prisma.InputJsonValue,
      },
    });

    await this.outbox.create(this.prisma, {
      tenantId,
      topic: "kyc.submitted",
      eventType: "kyc.submitted",
      aggregateType: "kyc_application",
      aggregateId: application.id,
      payload: {
        applicationId: application.id,
        userId,
        provider,
        reference: result.providerReference,
      },
    });

    return {
      applicationId: application.id,
      provider: application.provider,
      status: this.mapProviderStatus(result.status),
      reference: result.providerReference,
    };
  }

  async submitKyb(
    userId: string | undefined,
    tenantId: string,
    input: {
      organizationName: string;
      registrationNumber: string;
      incorporationDate?: string;
      jurisdiction: string;
      directors: Array<{
        name: string;
        idNumber?: string;
        nationality?: string;
      }>;
      provider?: KycProvider;
    },
  ): Promise<unknown> {
    const provider = input.provider ?? KycProvider.SMILE_IDENTITY;
    const reference = `kyb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const application = await this.prisma.kybApplication.create({
      data: {
        tenantId,
        userId: userId ?? null,
        organizationName: input.organizationName,
        registrationNumber: input.registrationNumber,
        incorporationDate: input.incorporationDate
          ? new Date(input.incorporationDate)
          : undefined,
        jurisdiction: input.jurisdiction,
        provider,
        providerReference: reference,
        status: KycApplicationStatus.PENDING,
        directors: input.directors as Prisma.InputJsonValue,
        submittedDocuments: {
          reference,
          directorsCount: input.directors.length,
        } as Prisma.InputJsonValue,
      },
    });

    const adapter = this.getKycAdapter(provider);
    if (!adapter.verifyBusiness) {
      throw new BadRequestException(`${provider} does not support KYB`);
    }

    const result = await adapter.verifyBusiness({
      reference,
      organizationName: input.organizationName,
      registrationNumber: input.registrationNumber,
      jurisdiction: input.jurisdiction,
      incorporationDate: input.incorporationDate,
      directors: input.directors,
    });

    await this.prisma.kybApplication.update({
      where: { id: application.id },
      data: {
        providerReference: result.providerReference,
        status: this.mapProviderStatus(result.status),
        providerResult: result.rawResponse as Prisma.InputJsonValue,
      },
    });

    await this.outbox.create(this.prisma, {
      tenantId,
      topic: "kyb.submitted",
      eventType: "kyb.submitted",
      aggregateType: "kyb_application",
      aggregateId: application.id,
      payload: {
        applicationId: application.id,
        userId,
        provider,
        reference: result.providerReference,
      },
    });

    return {
      applicationId: application.id,
      provider: application.provider,
      status: this.mapProviderStatus(result.status),
      reference: result.providerReference,
    };
  }

  async processKycWebhook(
    provider: KycProvider,
    rawBody: string,
    signature: string | undefined,
  ): Promise<{ accepted: boolean; applicationId?: string }> {
    const adapter = this.getKycAdapter(provider);
    if (adapter.verifyWebhookSignature) {
      if (!signature) {
        this.logger.warn(`KYC webhook signature missing for ${provider}`);
        return { accepted: false };
      }
      const verified = await adapter.verifyWebhookSignature(rawBody, signature);
      if (!verified) {
        this.logger.warn(
          `KYC webhook signature verification failed for ${provider}`,
        );
        return { accepted: false };
      }
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const providerReference = String(
      payload.job_id ?? payload.reference ?? payload.id ?? "",
    );
    if (!providerReference) {
      this.logger.warn("KYC webhook missing provider reference");
      return { accepted: false };
    }

    const application = await this.prisma.kycApplication.findFirst({
      where: { provider, providerReference },
    });
    if (!application) {
      this.logger.warn(
        `No KYC application found for ${provider} ref ${providerReference}`,
      );
      return { accepted: false };
    }

    const newStatus = this.mapProviderStatus(
      String(payload.status ?? payload.ResultText ?? "pending"),
    );

    await this.transactions.run(async (tx) => {
      await tx.kycApplication.update({
        where: { id: application.id },
        data: {
          status: newStatus,
          providerResult: payload as Prisma.InputJsonValue,
          verifiedAt:
            newStatus === KycApplicationStatus.VERIFIED
              ? new Date()
              : undefined,
          rejectedAt:
            newStatus === KycApplicationStatus.REJECTED
              ? new Date()
              : undefined,
          rejectionReason:
            newStatus === KycApplicationStatus.REJECTED
              ? String(payload.rejection_reason ?? payload.reason ?? "Unknown")
              : undefined,
        },
      });

      if (newStatus === KycApplicationStatus.VERIFIED) {
        await tx.user.update({
          where: { id: application.userId },
          data: { kycStatus: KycStatus.VERIFIED },
        });
        await this.outbox.create(tx, {
          tenantId: application.tenantId,
          topic: "kyc.verified",
          eventType: "kyc.verified",
          aggregateType: "kyc_application",
          aggregateId: application.id,
          payload: {
            applicationId: application.id,
            userId: application.userId,
            provider,
            status: newStatus,
          },
        });
        await this.outbox.create(tx, {
          tenantId: application.tenantId,
          topic: "user.verified",
          eventType: "user.verified",
          aggregateType: "user",
          aggregateId: application.userId,
          payload: {
            userId: application.userId,
            applicationId: application.id,
            provider,
            kycStatus: KycStatus.VERIFIED,
          },
        });
      } else if (newStatus === KycApplicationStatus.REJECTED) {
        await tx.complianceAlert.create({
          data: {
            tenantId: application.tenantId,
            type: ComplianceAlertType.KYC_ISSUE,
            severity: ComplianceAlertSeverity.HIGH,
            status: ComplianceAlertStatus.OPEN,
            entityType: "kyc_application",
            entityId: application.id,
            title: "KYC Verification Rejected",
            description: `User ${application.userId} KYC rejected: ${String(payload.rejection_reason ?? payload.reason ?? "Unknown")}`,
          },
        });
        await this.outbox.create(tx, {
          tenantId: application.tenantId,
          topic: "kyc.rejected",
          eventType: "kyc.rejected",
          aggregateType: "kyc_application",
          aggregateId: application.id,
          payload: {
            applicationId: application.id,
            userId: application.userId,
            provider,
            status: newStatus,
          },
        });
      }
    });

    return { accepted: true, applicationId: application.id };
  }

  async getKycStatus(
    userId: string,
    _requester: AuthenticatedUser,
  ): Promise<unknown> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { select: { tenantId: true }, take: 1 } },
    });
    if (!user) throw new NotFoundException("User not found");
    const userTenantId =
      (user.memberships[0]?.tenantId as string | undefined) ??
      _requester.tenantId;
    this.permissions.assertTenantAccess(_requester, userTenantId);

    const applications = await this.prisma.kycApplication.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      userId,
      kycStatus: user.kycStatus,
      applications: applications.map((a) => ({
        id: a.id,
        provider: a.provider,
        status: a.status,
        providerReference: a.providerReference,
        idType: a.idType,
        idNumber: a.idNumber ? `****${a.idNumber.slice(-4)}` : null,
        verifiedAt: a.verifiedAt,
        rejectedAt: a.rejectedAt,
        rejectionReason: a.rejectionReason,
        createdAt: a.createdAt,
      })),
    };
  }

  async getKybStatus(
    userId: string | undefined,
    _requester: AuthenticatedUser,
  ): Promise<unknown> {
    const where = userId ? { userId } : {};
    const applications = await this.prisma.kybApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      applications: applications.map((a) => ({
        id: a.id,
        organizationName: a.organizationName,
        provider: a.provider,
        status: a.status,
        providerReference: a.providerReference,
        jurisdiction: a.jurisdiction,
        verifiedAt: a.verifiedAt,
        rejectedAt: a.rejectedAt,
        rejectionReason: a.rejectionReason,
        createdAt: a.createdAt,
      })),
    };
  }

  private mapProviderStatus(status: string): KycApplicationStatus {
    const s = status.toUpperCase();
    if (s === "VERIFIED" || s === "SUCCESS" || s === "SUCCESSFUL")
      return KycApplicationStatus.VERIFIED;
    if (s === "REJECTED" || s === "FAILED" || s === "FAILURE")
      return KycApplicationStatus.REJECTED;
    if (s === "PROCESSING" || s === "IN_PROGRESS")
      return KycApplicationStatus.PROCESSING;
    if (s === "SUBMITTED") return KycApplicationStatus.SUBMITTED;
    return KycApplicationStatus.PENDING;
  }
}
