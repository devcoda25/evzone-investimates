import { PlatformRole } from "@prisma/client";

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: PlatformRole;
  tenantId: string;
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
  tenantId: string;
}
