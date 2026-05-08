import { Module } from "@nestjs/common";
import {
  PaymentsController,
  PaymentWebhooksController,
} from "./payments.controller";
import {
  PaymentIntentsService,
  PayoutsService,
  PaymentWebhooksService,
  PaymentProviderRouterService,
  ReconciliationService,
} from "./payments.service";
import { PaymentSchedulesService } from "./payment-schedules.service";
import { FlutterwaveAdapter } from "./flutterwave.adapter";
import { PaytotaAdapter } from "./paytota.adapter";
import { LedgerPostingService } from "./ledger-posting.service";
import { KycKybService } from "./kyc-kyb.service";
import { SmileIdentityAdapter } from "./smile-identity.adapter";
import { KycKybController, KycWebhooksController } from "./kyc-kyb.controller";

@Module({
  controllers: [
    PaymentsController,
    PaymentWebhooksController,
    KycKybController,
    KycWebhooksController,
  ],
  providers: [
    PaymentProviderRouterService,
    PaymentIntentsService,
    PayoutsService,
    PaymentWebhooksService,
    ReconciliationService,
    PaymentSchedulesService,
    LedgerPostingService,
    KycKybService,
    FlutterwaveAdapter,
    PaytotaAdapter,
    SmileIdentityAdapter,
  ],
  exports: [
    PaymentIntentsService,
    PayoutsService,
    PaymentSchedulesService,
    LedgerPostingService,
    KycKybService,
  ],
})
export class PaymentsModule {}
