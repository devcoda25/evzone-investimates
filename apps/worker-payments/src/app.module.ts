import { Module } from "@nestjs/common";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

@Module({
  providers: [PaymentReconciliationService],
})
export class AppModule {}