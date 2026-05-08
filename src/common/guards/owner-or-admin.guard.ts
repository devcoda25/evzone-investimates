import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@common/decorators/roles.decorator';

@Injectable()
export class OwnerOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    if (user.role === UserRole.ADMIN) return true;

    const resourceUserId = request.params.userId || request.params.id;
    if (resourceUserId && resourceUserId === user.id) return true;

    const bodyUserId = request.body?.userId;
    if (bodyUserId && bodyUserId === user.id) return true;

    throw new ForbiddenException('You can only access your own resources');
  }
}
