import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PlatformRole } from "@prisma/client";
import { RequestWithUser } from "@evzone/common";

@Injectable()
export class OwnerOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const targetId = request.params.id;
    if (!user) throw new ForbiddenException("Authentication required");
    if (
      user.role === PlatformRole.ADMIN ||
      user.role === PlatformRole.SUPER_ADMIN
    )
      return true;
    if (user.id === targetId) return true;
    throw new ForbiddenException("You can only access your own resource");
  }
}
