import { SetMetadata } from "@nestjs/common";
import { PlatformRole } from "@prisma/client";

export { PlatformRole };

export const ROLES_KEY = "roles";
export const Roles = (
  ...roles: PlatformRole[]
): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_KEY, roles);
