import { Global, Module } from "@nestjs/common";
import { ImpactReportingService } from "./impact-reporting.service";

@Global()
@Module({
  providers: [ImpactReportingService],
  exports: [ImpactReportingService],
})
export class ImpactModule {}