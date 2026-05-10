import { Prisma, PrismaClient, PlatformRole, UserStatus, KycStatus } from "@prisma/client";
import * as bcrypt from "bcrypt";

export class UserFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async create(overrides: Partial<Prisma.UserCreateInput> & { rawPassword?: string } = {}): Promise<{
    id: string;
    email: string;
    passwordHash: string;
    rawPassword: string;
  }> {
    const rawPassword = overrides.rawPassword ?? "TestPassword123!";
    const passwordHash =
      overrides.passwordHash != null
        ? String(overrides.passwordHash)
        : await bcrypt.hash(rawPassword, 10);

    const email =
      overrides.email ??
      `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@evzone.test`;

    const { rawPassword: _rawPassword, ...prismaOverrides } = overrides;

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: overrides.firstName ?? "Test",
        lastName: overrides.lastName ?? "User",
        status: (overrides.status as UserStatus) ?? UserStatus.ACTIVE,
        kycStatus: (overrides.kycStatus as KycStatus) ?? KycStatus.VERIFIED,
        ...prismaOverrides,
      },
    });

    return { id: user.id, email: user.email, passwordHash, rawPassword };
  }

  async createWithMembership(
    role: PlatformRole = PlatformRole.INVESTOR,
    overrides: Partial<Prisma.UserCreateInput> & { rawPassword?: string } = {},
  ): Promise<{
    id: string;
    email: string;
    tenantId: string;
    rawPassword: string;
  }> {
    const { id, email, rawPassword } = await this.create(overrides);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: `Tenant ${email}`,
          slug: `tenant-${id.slice(0, 8)}`,
          type: "ORGANIZATION",
        },
      });

      await tx.userTenantMembership.create({
        data: {
          userId: id,
          tenantId: tenant.id,
          role,
          status: "ACTIVE",
        },
      });

      if (role === PlatformRole.INVESTOR) {
        await tx.investorProfile.create({
          data: { userId: id },
        });
      } else if (role === PlatformRole.ENTREPRENEUR) {
        await tx.entrepreneurProfile.create({
          data: {
            userId: id,
            companyName: `Company ${email}`,
            industry: "Other",
          },
        });
      } else if (role === PlatformRole.ASSESSOR) {
        await tx.assessorProfile.create({
          data: {
            userId: id,
            organizationName: `Assessor ${email}`,
          },
        });
      }

      return { tenantId: tenant.id };
    });

    return { id, email, tenantId: result.tenantId, rawPassword };
  }
}
