import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UseGuards,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUser, CurrentUser, Roles } from "@evzone/common";
import { JwtAuthGuard, RolesGuard } from "@evzone/auth";
import { KycProvider, PlatformRole } from "@prisma/client";
import { KycKybService } from "./kyc-kyb.service";

class SubmitKycDto {
  provider?: KycProvider;
  idType!: string;
  idNumber!: string;
  idExpiryDate?: string;
  nationality?: string;
  dateOfBirth?: string;
  selfieImage?: string;
  idImageFront?: string;
  idImageBack?: string;
}

class SubmitKybDto {
  organizationName!: string;
  registrationNumber!: string;
  incorporationDate?: string;
  jurisdiction!: string;
  directors!: Array<{
    name: string;
    idNumber?: string;
    nationality?: string;
  }>;
  provider?: KycProvider;
}

@ApiTags("KYC / KYB")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class KycKybController {
  private readonly logger = new Logger(KycKybController.name);

  constructor(private readonly kycKybService: KycKybService) {}

  @Post(":id/kyc-submit")
  @Roles(PlatformRole.INVESTOR, PlatformRole.ENTREPRENEUR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Submit identity verification to KYC provider" })
  async submitKyc(
    @Param("id") id: string,
    @Body() dto: SubmitKycDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    if (id !== user.id && !this.isAdmin(user)) {
      throw new BadRequestException("You can only submit KYC for yourself");
    }
    return this.kycKybService.submitKyc(id, user.tenantId, dto);
  }

  @Get(":id/kyc-application")
  @Roles(PlatformRole.INVESTOR, PlatformRole.ENTREPRENEUR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get KYC application status" })
  async getKycStatus(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.kycKybService.getKycStatus(id, user);
  }

  @Post(":id/kyb-submit")
  @Roles(PlatformRole.ENTREPRENEUR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Submit business verification to KYB provider" })
  async submitKyb(
    @Param("id") id: string,
    @Body() dto: SubmitKybDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.kycKybService.submitKyb(id, user.tenantId, dto);
  }

  @Get(":id/kyb-application")
  @Roles(PlatformRole.ENTREPRENEUR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get KYB application status" })
  async getKybStatus(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.kycKybService.getKybStatus(id, user);
  }

  private isAdmin(user: AuthenticatedUser): boolean {
    return (
      user.role === PlatformRole.ADMIN ||
      user.role === PlatformRole.SUPER_ADMIN ||
      user.role === PlatformRole.COMPLIANCE_OFFICER
    );
  }
}

@Controller("users/kyc-webhooks")
export class KycWebhooksController {
  private readonly logger = new Logger(KycWebhooksController.name);

  constructor(private readonly kycKybService: KycKybService) {}

  @Post(":provider")
  @ApiOperation({ summary: "Receive KYC provider webhooks" })
  async receiveKycWebhook(
    @Param("provider") provider: string,
    @Body() rawBody: unknown,
    @Headers("x-webhook-signature") signature: string | undefined,
  ): Promise<{ received: boolean }> {
    const providerEnum = this.parseProvider(provider);
    const rawBodyStr =
      typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);

    const result = await this.kycKybService.processKycWebhook(
      providerEnum,
      rawBodyStr,
      signature,
    );

    return { received: result.accepted };
  }

  private parseProvider(provider: string): KycProvider {
    const normalized = provider.toUpperCase().replace(/-/g, "_");
    if (normalized === "SMILE_IDENTITY" || normalized === "SMILEIDENTITY") {
      return KycProvider.SMILE_IDENTITY;
    }
    if (normalized === "ONFIDO") return KycProvider.ONFIDO;
    if (normalized === "GENERIC") return KycProvider.GENERIC;
    throw new BadRequestException(`Unknown KYC provider: ${provider}`);
  }
}
