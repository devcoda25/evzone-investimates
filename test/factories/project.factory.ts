import { Prisma, PrismaClient, ProjectStatus, GreenSector, ProjectStage } from "@prisma/client";

export class ProjectFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    ownerUserId: string,
    tenantId: string,
    overrides: Partial<Prisma.ProjectUncheckedCreateInput> = {},
  ): Promise<{ id: string; slug: string }> {
    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = overrides.slug ?? `project-${id.slice(-6)}`;

    const project = await this.prisma.project.create({
      data: {
        id,
        tenantId,
        ownerUserId,
        title: overrides.title ?? `Test Project ${id.slice(-6)}`,
        slug,
        summary: overrides.summary ?? "A test project for integration testing",
        description: overrides.description ?? "Test project description",
        countryCode: overrides.countryCode ?? "KE",
        country: overrides.country ?? "Kenya",
        sector: (overrides.sector as GreenSector) ?? GreenSector.SOLAR,
        stage: (overrides.stage as ProjectStage) ?? ProjectStage.CONCEPT,
        status: (overrides.status as ProjectStatus) ?? ProjectStatus.DRAFT,
        fundingTarget:
          (overrides.fundingTarget as Prisma.Decimal | number | undefined) ?? new Prisma.Decimal(1_000_000),
        currency: overrides.currency ?? "USD",
        minInvestment: (overrides.minInvestment as Prisma.Decimal | number | undefined) ?? new Prisma.Decimal(100),
        ...overrides,
      } as Prisma.ProjectUncheckedCreateInput,
    });

    return { id: project.id, slug: project.slug };
  }
}
