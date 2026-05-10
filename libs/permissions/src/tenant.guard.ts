import { Injectable, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticatedUser, RequestWithUser } from "@evzone/common";
import { PermissionsService } from "@evzone/permissions";

/**
 * TenantGuard ensures that all requests are scoped to the user's tenant.
 * It extracts the tenant from the request (via user or query param) and
 * verifies the authenticated user has access to that tenant.
 */
@Injectable()
export class TenantGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    // Allow platform admins to bypass tenant scoping
    if (this.permissions.isPlatformAdmin(user)) {
      return true;
    }

    // Get tenant from request params, query, or body
    const route = context.switchToHttp().getRequest();
    const params = route.params;
    const query = route.query;
    const body = route.body;

    const tenantId =
      params?.tenantId ||
      query?.tenantId ||
      body?.tenantId ||
      user.tenantId;

    if (!tenantId) {
      throw new ForbiddenException("Tenant context is required");
    }

    if (!this.permissions.canAccessTenant(user, tenantId)) {
      throw new ForbiddenException(
        "You do not have access to the specified tenant",
      );
    }

    // Attach tenantId to request for downstream use
    request.tenantId = tenantId;

    return true;
  }
}