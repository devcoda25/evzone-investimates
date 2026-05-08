import { PlatformRole } from "@prisma/client";
import { Request } from "express";

export interface AuthenticatedMembership {
  tenantId: string;
  role: PlatformRole;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: PlatformRole;
  tenantId: string;
  memberships: AuthenticatedMembership[];
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
