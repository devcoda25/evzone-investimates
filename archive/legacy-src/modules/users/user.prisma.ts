import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { withFullName } from '@database/prisma.helpers';

export const userProfileInclude = {
  investorProfile: true,
  entrepreneurProfile: true,
  assessorProfile: true,
} satisfies Prisma.UserInclude;

export type UserWithProfiles = Prisma.UserGetPayload<{
  include: typeof userProfileInclude;
}>;

export function mapUserRole(role?: string | null): UserRole {
  switch ((role || '').toLowerCase()) {
    case 'entrepreneur':
      return UserRole.ENTREPRENEUR;
    case 'provider':
    case 'assessor':
      return UserRole.ASSESSOR;
    case 'admin':
    case 'super_admin':
      return UserRole.ADMIN;
    default:
      return UserRole.INVESTOR;
  }
}

export async function createRoleProfile(
  prisma: Prisma.TransactionClient | PrismaClient,
  userId: string,
  role: UserRole,
): Promise<void> {
  switch (role) {
    case UserRole.INVESTOR: {
      await prisma.investorProfile.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });
      return;
    }
    case UserRole.ENTREPRENEUR: {
      await prisma.entrepreneurProfile.upsert({
        where: { userId },
        update: {},
        create: { userId, companyName: 'My Company', industry: 'Other' },
      });
      return;
    }
    case UserRole.ASSESSOR: {
      await prisma.assessorProfile.upsert({
        where: { userId },
        update: {},
        create: { userId, organizationName: 'My Organization', yearsOfExperience: 0 },
      });
      return;
    }
    default:
      return;
  }
}

export function normalizeUser<T extends { firstName: string; lastName: string }>(user: T) {
  return withFullName(user);
}
