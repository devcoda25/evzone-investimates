import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { PrismaClient, PlatformRole, ProjectStatus, InvestmentStatus } from "@prisma/client";
import { AppModule } from "../apps/api/src/app.module";
import { UserFactory } from "./factories/user.factory";
import { ProjectFactory } from "./factories/project.factory";

describe("InvestmentsModule (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let userFactory: UserFactory;
  let projectFactory: ProjectFactory;

  beforeAll(async () => {
    prisma = new PrismaClient();
    userFactory = new UserFactory(prisma);
    projectFactory = new ProjectFactory(prisma);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.ledgerEntry.deleteMany();
    await prisma.ledgerAccount.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.investment.deleteMany();
    await prisma.milestone.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.document.deleteMany();
    await prisma.dueDiligenceTask.deleteMany();
    await prisma.dueDiligenceCase.deleteMany();
    await prisma.deal.deleteMany();
    await prisma.project.deleteMany();
    await prisma.userTenantMembership.deleteMany();
    await prisma.investorProfile.deleteMany();
    await prisma.entrepreneurProfile.deleteMany();
    await prisma.assessorProfile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  async function loginInvestor(): Promise<{
    accessToken: string;
    userId: string;
    tenantId: string;
  }> {
    const { email, rawPassword, tenantId } = await userFactory.createWithMembership(
      PlatformRole.INVESTOR,
    );
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: rawPassword })
      .expect(200);
    return { accessToken: res.body.accessToken, userId: res.body.user.id, tenantId };
  }

  describe("POST /investments", () => {
    it("should create an investment with idempotency key", async () => {
      const { accessToken, tenantId } = await loginInvestor();
      const { id: projectId } = await projectFactory.create(
        "owner-id",
        tenantId,
        { status: ProjectStatus.ACTIVE, fundingTarget: 1_000_000 },
      );

      const idempotencyKey = `ik_${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post("/api/v1/investments")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          projectId,
          amount: 5000,
          currency: "USD",
        })
        .expect(201);

      expect(res.body).toHaveProperty("id");
      expect(res.body.status).toBe(InvestmentStatus.PENDING_COMPLIANCE);
      expect(Number(res.body.amount)).toBe(5000);

      // Verify ledger entries were created
      const investment = await prisma.investment.findUnique({
        where: { id: res.body.id },
      });
      expect(investment).not.toBeNull();

      const ledgerEntries = await prisma.ledgerEntry.findMany({
        where: { transactionId: res.body.id },
      });
      expect(ledgerEntries.length).toBe(2);

      const debitTotal = ledgerEntries
        .filter((e) => e.direction === "DEBIT")
        .reduce((sum, e) => sum + e.amount.toNumber(), 0);
      const creditTotal = ledgerEntries
        .filter((e) => e.direction === "CREDIT")
        .reduce((sum, e) => sum + e.amount.toNumber(), 0);
      expect(debitTotal).toBeCloseTo(creditTotal, 2);
    });

    it("should return existing investment for duplicate idempotency key", async () => {
      const { accessToken, tenantId } = await loginInvestor();
      const { id: projectId } = await projectFactory.create(
        "owner-id",
        tenantId,
        { status: ProjectStatus.ACTIVE, fundingTarget: 1_000_000 },
      );

      const idempotencyKey = `ik_dup_${Date.now()}`;
      const first = await request(app.getHttpServer())
        .post("/api/v1/investments")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ projectId, amount: 3000, currency: "USD" })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post("/api/v1/investments")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ projectId, amount: 3000, currency: "USD" })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
    });

    it("should reject investment below minimum", async () => {
      const { accessToken, tenantId } = await loginInvestor();
      const { id: projectId } = await projectFactory.create(
        "owner-id",
        tenantId,
        {
          status: ProjectStatus.ACTIVE,
          fundingTarget: 1_000_000,
          minInvestment: 1000,
        },
      );

      await request(app.getHttpServer())
        .post("/api/v1/investments")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Idempotency-Key", `ik_min_${Date.now()}`)
        .send({ projectId, amount: 500, currency: "USD" })
        .expect(400);
    });

    it("should reject investment in non-investable project", async () => {
      const { accessToken, tenantId } = await loginInvestor();
      const { id: projectId } = await projectFactory.create(
        "owner-id",
        tenantId,
        { status: ProjectStatus.DRAFT, fundingTarget: 1_000_000 },
      );

      await request(app.getHttpServer())
        .post("/api/v1/investments")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Idempotency-Key", `ik_draft_${Date.now()}`)
        .send({ projectId, amount: 5000, currency: "USD" })
        .expect(400);
    });
  });

  describe("POST /investments/:id/cancel", () => {
    it("should cancel a pending investment and reverse ledger", async () => {
      const { accessToken, tenantId } = await loginInvestor();
      const { id: projectId } = await projectFactory.create(
        "owner-id",
        tenantId,
        { status: ProjectStatus.ACTIVE, fundingTarget: 1_000_000 },
      );

      const createRes = await request(app.getHttpServer())
        .post("/api/v1/investments")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Idempotency-Key", `ik_cancel_${Date.now()}`)
        .send({ projectId, amount: 4000, currency: "USD" })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/investments/${createRes.body.id}/cancel`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(201);

      const investment = await prisma.investment.findUnique({
        where: { id: createRes.body.id },
      });
      expect(investment?.status).toBe(InvestmentStatus.CANCELLED);

      // Verify refund transaction exists
      const refundTx = await prisma.transaction.findFirst({
        where: {
          investmentId: createRes.body.id,
          type: "REFUND",
        },
      });
      expect(refundTx).not.toBeNull();
    });
  });
});
