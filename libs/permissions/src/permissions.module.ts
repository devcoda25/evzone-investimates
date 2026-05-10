import { Global, Module } from "@nestjs/common";
import { PermissionsService } from "./permissions.service";
import { TenantGuard } from "./tenant.guard";

@Global()
@Module({
  providers: [PermissionsService, TenantGuard],
  exports: [PermissionsService, TenantGuard],
})
export class PermissionsModule {}
