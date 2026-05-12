import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
  Query,
  BadRequestException,
  Logger,
  ParseEnumPipe,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUser, CurrentUser, Roles } from "@evzone/common";
import { JwtAuthGuard, RolesGuard } from "@evzone/auth";
import { PaymentProvider, PaymentStatus, PlatformRole } from "@prisma/client";
import {
  PaymentIntentsService,
  PayoutsService,
  PaymentWebhooksService,
  ReconciliationService,
} from "./payments.service";
import { PaymentSchedulesService } from "./payment-schedules.service";

// ============= DTOs =============

class CreateCollectionIntentDto {
  amount!: string;
  currency!: string;
  customerEmail!: string;
  customerPhone?: string;
  customerName?: string;
  customerCountry?: string;
  investmentId?: string;
  dealId?: string;
  purpose!:
    | "INVESTMENT_FUNDING"
    | "INVESTOR_TOPUP"
    | "PROJECT_REPAYMENT"
    | "INVESTOR_DISTRIBUTION"
    | "ASSESSOR_FEE"
    | "PLATFORM_FEE"
    | "REFUND";
  redirectUrl?: string;
  paymentMethod?: string;
}

class CreatePayoutDto {
  amount!: string;
  currency!: string;
  destinationType!: "BANK_ACCOUNT" | "MOBILE_MONEY" | "WALLET";
  destinationAccount!: string;
  destinationBankCode?: string;
  destinationMobileMoneyProvider?: string;
  recipientName!: string;
  recipientEmail?: string;
  description?: string;
  userId?: string;
  organizationId?: string;
}

@ApiTags("Payments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("payments")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly intentsService: PaymentIntentsService,
    private readonly payoutsService: PayoutsService,
    private readonly reconciliationService: ReconciliationService,
    private readonly schedulesService: PaymentSchedulesService,
  ) {}

  @Post("collection-intents")
  @Roles(PlatformRole.INVESTOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Create a payment collection intent" })
  @ApiResponse({ status: 201, description: "Collection intent created" })
  async createCollectionIntent(
    @Body() dto: CreateCollectionIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.intentsService.createCollectionIntent({
      ...dto,
      tenantId: user.tenantId,
      userId: user.id,
      purpose: dto.purpose,
    });
  }

  @Get(":id/status")
  @Roles(PlatformRole.INVESTOR, PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get payment intent status" })
  async getPaymentStatus(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.intentsService.findIntentById(id, user);
  }

  @Post("payouts")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Create a payout" })
  async createPayout(
    @Body() dto: CreatePayoutDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.payoutsService.createPayout({
      ...dto,
      tenantId: user.tenantId,
    });
  }

  @Get("payouts")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "List payouts" })
  async listPayouts(
    @Query("status", new ParseEnumPipe(PaymentStatus, { optional: true })) status: PaymentStatus | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.payoutsService.findPayouts(user.tenantId, status);
  }

  @Get("schedule")
  @ApiOperation({ summary: "List payment schedules for current user" })
  async listSchedules(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.schedulesService.findByUser(user);
  }

  @Get("schedule/:id")
  @ApiOperation({ summary: "Get payment schedule by ID" })
  async getSchedule(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.schedulesService.findById(id, user);
  }

  @Post("reconcile")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Run reconciliation for pending payments" })
  async reconcile(
    @Body()
    dto: { provider: PaymentProvider; startDate: string; endDate: string },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.reconciliationService.runReconciliation(
      user.tenantId,
      dto.provider,
      new Date(dto.startDate),
      new Date(dto.endDate),
    );
  }

  @Post("reconcile/daily")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Run daily reconciliation for previous day" })
  async reconcileDaily(
    @Body() dto: { provider: PaymentProvider },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.reconciliationService.runDailyReconciliation(
      user.tenantId,
      dto.provider,
    );
  }
}

@Controller("payments/webhooks")
export class PaymentWebhooksController {
  private readonly logger = new Logger(PaymentWebhooksController.name);

  constructor(private readonly webhooksService: PaymentWebhooksService) {}

  @Post(":provider")
  @ApiOperation({ summary: "Receive payment provider webhooks" })
  async receiveWebhook(
    @Param("provider") provider: string,
    @Body() rawBody: unknown,
    @Headers("x-webhook-signature") signature: string | undefined,
    @Headers("verif-hash") flutterwaveHash: string | undefined,
  ): Promise<{ received: boolean; eventId: string }> {
    const providerEnum = this.parseProvider(provider);
    const rawBodyStr =
      typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);

    // Flutterwave uses verif-hash header
    const sig = signature ?? flutterwaveHash;

    const result = await this.webhooksService.processWebhook(
      providerEnum,
      rawBodyStr,
      sig,
    );

    return { received: result.accepted, eventId: result.id };
  }

  private parseProvider(provider: string): PaymentProvider {
    const normalized = provider.toUpperCase();
    if (normalized === "FLUTTERWAVE" || normalized === "FLW") {
      return PaymentProvider.FLUTTERWAVE;
    }
    if (normalized === "PAYTOTA") {
      return PaymentProvider.PAYTOTA;
    }
    throw new BadRequestException(`Unknown webhook provider: ${provider}`);
  }
}
