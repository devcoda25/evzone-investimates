import {
  PrismaClient,
  PlatformRole,
  ProjectStage,
  GreenSector,
  ProjectStatus,
  KycStatus,
  UserStatus,
  TenantType,
  DealStatus,
  ComplianceAlertSeverity,
  ComplianceAlertStatus,
  ComplianceAlertType,
  NotificationType,
  DisputeType,
  User,
} from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash("Admin123!", 12);
  const platformTenant = await prisma.tenant.upsert({
    where: { slug: "evzone-platform" },
    update: {},
    create: {
      name: "EVzone Platform",
      slug: "evzone-platform",
      type: TenantType.PLATFORM,
      countryCode: "UG",
    },
  });

  const admin = await createUser({
    tenantId: platformTenant.id,
    email: "admin@evzone.com",
    passwordHash,
    firstName: "EVzone",
    lastName: "Admin",
    role: PlatformRole.SUPER_ADMIN,
  });
  const investor = await createUser({
    tenantId: platformTenant.id,
    email: "sarah.chen@email.com",
    passwordHash: await bcrypt.hash("Investor123!", 12),
    firstName: "Sarah",
    lastName: "Chen",
    role: PlatformRole.INVESTOR,
  });
  await prisma.investorProfile.upsert({
    where: { userId: investor.id },
    update: {},
    create: {
      userId: investor.id,
      preferredSectors: ["SOLAR", "WIND"],
      investmentGoals: ["Impact returns"],
    },
  });

  const entrepreneur = await createUser({
    tenantId: platformTenant.id,
    email: "amina.osei@email.com",
    passwordHash: await bcrypt.hash("Entrepreneur123!", 12),
    firstName: "Amina",
    lastName: "Osei",
    role: PlatformRole.ENTREPRENEUR,
  });
  await prisma.entrepreneurProfile.upsert({
    where: { userId: entrepreneur.id },
    update: {},
    create: {
      userId: entrepreneur.id,
      companyName: "SunHarvest Microgrids",
      industry: "Renewable Energy",
      stage: "EARLY_REVENUE",
    },
  });

  const assessor = await createUser({
    tenantId: platformTenant.id,
    email: "dr.kwame@email.com",
    passwordHash: await bcrypt.hash("Provider123!", 12),
    firstName: "Kwame",
    lastName: "Asante",
    role: PlatformRole.ASSESSOR,
  });
  await prisma.assessorProfile.upsert({
    where: { userId: assessor.id },
    update: {},
    create: {
      userId: assessor.id,
      organizationName: "Asante Green Due Diligence",
      specialties: ["ESG", "FINANCIAL", "TECHNICAL"],
      yearsOfExperience: 12,
      serviceRegions: ["UG", "KE", "GH"],
      insuranceValid: true,
      tier: "Gold",
    },
  });

  const project = await prisma.project.upsert({
    where: {
      tenantId_slug: {
        tenantId: platformTenant.id,
        slug: "sunharvest-microgrids",
      },
    },
    update: {},
    create: {
      tenantId: platformTenant.id,
      ownerUserId: entrepreneur.id,
      title: "SunHarvest Microgrids",
      slug: "sunharvest-microgrids",
      summary: "Solar microgrids for productive-use energy in East Africa.",
      description:
        "A portfolio of solar microgrids serving small businesses and homes.",
      country: "Uganda",
      countryCode: "UG",
      city: "Kampala",
      sector: GreenSector.SOLAR,
      stage: ProjectStage.FEASIBILITY,
      status: ProjectStatus.ACTIVE,
      fundingTarget: 500000,
      minInvestment: 100,
      currency: "USD",
      impactMetrics: { co2Avoided: 1200, householdsServed: 4000 },
      sdgs: [7, 8, 13],
    },
  });

  await prisma.deal.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: platformTenant.id,
      projectId: project.id,
      title: "SunHarvest Seed Raise",
      status: DealStatus.LIVE,
      minInvestment: 100,
      targetAmount: 500000,
      currency: "USD",
    },
  });

  await prisma.complianceAlert.createMany({
    data: [
      {
        tenantId: platformTenant.id,
        type: ComplianceAlertType.MANUAL_REVIEW,
        severity: ComplianceAlertSeverity.MEDIUM,
        status: ComplianceAlertStatus.OPEN,
        entityType: "PROJECT",
        entityId: project.id,
        title: "Project due diligence required",
        description:
          "SunHarvest Microgrids is active and should receive an assessor mandate.",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.notification.create({
    data: {
      tenantId: platformTenant.id,
      userId: entrepreneur.id,
      type: NotificationType.PROJECT_UPDATE,
      title: "Project listed",
      message: "SunHarvest Microgrids is ready for investor discovery.",
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: platformTenant.id,
      userId: admin.id,
      action: "seed.completed",
      entityType: "tenant",
      entityId: platformTenant.id,
      metadata: { users: 4, projects: 1 },
    },
  });

  await prisma.dispute.create({
    data: {
      tenantId: platformTenant.id,
      type: DisputeType.OTHER,
      title: "Demo support dispute",
      description: "Seeded dispute for admin workflow smoke tests.",
      initiatorId: investor.id,
    },
  });
}

async function createUser(input: {
  tenantId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: PlatformRole;
}): Promise<User> {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.VERIFIED,
    },
    create: {
      email: input.email,
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.VERIFIED,
    },
  });
  await prisma.userTenantMembership.upsert({
    where: {
      userId_tenantId_role: {
        userId: user.id,
        tenantId: input.tenantId,
        role: input.role,
      },
    },
    update: {},
    create: { userId: user.id, tenantId: input.tenantId, role: input.role },
  });
  return user;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
