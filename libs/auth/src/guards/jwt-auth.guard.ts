import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { PlatformRole, UserStatus } from "@prisma/client";
import { IS_PUBLIC_KEY, RequestWithUser } from "@evzone/common";
import { PrismaService } from "@evzone/database";
import { JwtAccessPayload } from "../types/jwt-payload";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);
    const payload = await this.verifyToken(token);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        deletedAt: true,
        memberships: {
          where: { status: "ACTIVE" },
          select: { tenantId: true, role: true },
        },
      },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException("User not found");
    }
    if (
      user.status === UserStatus.BLOCKED ||
      user.status === UserStatus.SUSPENDED
    ) {
      throw new UnauthorizedException("Account is not active");
    }
    if (user.memberships.length === 0) {
      throw new UnauthorizedException("User has no active tenant membership");
    }

    const matchingMembership =
      user.memberships.find(
        (membership) => membership.tenantId === payload.tenantId,
      ) ?? user.memberships[0];

    request.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: matchingMembership.role,
      tenantId: matchingMembership.tenantId,
      memberships: user.memberships.map((membership) => ({
        tenantId: membership.tenantId,
        role: membership.role,
      })),
    };

    return true;
  }

  private extractBearerToken(header: string | undefined): string {
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException(
        "Authorization header missing or invalid",
      );
    }
    return header.slice(7);
  }

  private async verifyToken(token: string): Promise<JwtAccessPayload> {
    try {
      const payload =
        await this.jwtService.verifyAsync<JwtAccessPayload>(token);
      if (
        !payload.sub ||
        !payload.email ||
        !payload.tenantId ||
        !Object.values(PlatformRole).includes(payload.role)
      ) {
        throw new UnauthorizedException("Invalid access token payload");
      }
      return payload;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
