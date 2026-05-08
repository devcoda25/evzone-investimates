import { ForbiddenException, Injectable } from "@nestjs/common";
import { PlatformRole } from "@prisma/client";
import { AuthenticatedUser } from "@evzone/common";

@Injectable()
export class PermissionsService {
  isPlatformAdmin(user: AuthenticatedUser): boolean {
    return (
      user.role === PlatformRole.ADMIN || user.role === PlatformRole.SUPER_ADMIN
    );
  }

  canAccessTenant(user: AuthenticatedUser, tenantId: string): boolean {
    return (
      this.isPlatformAdmin(user) ||
      user.memberships.some((membership) => membership.tenantId === tenantId)
    );
  }

  assertTenantAccess(user: AuthenticatedUser, tenantId: string): void {
    if (!this.canAccessTenant(user, tenantId)) {
      throw new ForbiddenException("You do not have access to this tenant");
    }
  }

  assertOwnerOrAdmin(user: AuthenticatedUser, ownerUserId: string): void {
    if (this.isPlatformAdmin(user) || user.id === ownerUserId) return;
    throw new ForbiddenException("You can only access your own resource");
  }
}
