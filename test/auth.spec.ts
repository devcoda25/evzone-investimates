import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { PrismaClient, PlatformRole } from "@prisma/client";
import { AppModule } from "../apps/api/src/app.module";
import { UserFactory } from "./factories/user.factory";

describe("AuthModule (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let userFactory: UserFactory;

  beforeAll(async () => {
    prisma = new PrismaClient();
    userFactory = new UserFactory(prisma);

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
    await prisma.passwordResetToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.userTenantMembership.deleteMany();
    await prisma.investorProfile.deleteMany();
    await prisma.entrepreneurProfile.deleteMany();
    await prisma.assessorProfile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  describe("POST /auth/register", () => {
    it("should register a new investor and return tokens", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "new.investor@evzone.test",
          password: "SecurePass123!",
          firstName: "New",
          lastName: "Investor",
          role: PlatformRole.INVESTOR,
        })
        .expect(201);

      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body).toHaveProperty("user");
      expect(res.body.user.role).toBe(PlatformRole.INVESTOR);
    });

    it("should reject privileged role self-registration", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "hacker@evzone.test",
          password: "SecurePass123!",
          firstName: "Bad",
          lastName: "Actor",
          role: PlatformRole.ADMIN,
        })
        .expect(400);
    });

    it("should reject invalid email", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "not-an-email",
          password: "SecurePass123!",
          firstName: "Bad",
          lastName: "Email",
        })
        .expect(400);
    });

    it("should reject short password", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "short.pass@evzone.test",
          password: "123",
          firstName: "Short",
          lastName: "Pass",
        })
        .expect(400);
    });
  });

  describe("POST /auth/login", () => {
    it("should login with valid credentials", async () => {
      const { email, rawPassword } = await userFactory.createWithMembership(
        PlatformRole.INVESTOR,
        { email: "login.test@evzone.test" },
      );

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: rawPassword })
        .expect(200);

      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
    });

    it("should reject invalid password", async () => {
      const { email } = await userFactory.createWithMembership(
        PlatformRole.INVESTOR,
        { email: "bad.login@evzone.test" },
      );

      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "WrongPassword123!" })
        .expect(401);
    });

    it("should lock account after 5 failed attempts", async () => {
      const { email } = await userFactory.createWithMembership(
        PlatformRole.INVESTOR,
        { email: "locked@evzone.test" },
      );

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email, password: "wrong" })
          .expect(401);
      }

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.lockoutUntil).not.toBeNull();
      expect(user?.lockoutUntil != null && user.lockoutUntil > new Date()).toBe(true);
    });
  });

  describe("POST /auth/refresh", () => {
    it("should issue new tokens with valid refresh token", async () => {
      const { email, rawPassword } = await userFactory.createWithMembership(
        PlatformRole.INVESTOR,
        { email: "refresh.test@evzone.test" },
      );

      const loginRes = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: rawPassword })
        .expect(200);

      const refreshRes = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);

      expect(refreshRes.body).toHaveProperty("accessToken");
      expect(refreshRes.body).toHaveProperty("refreshToken");
    });

    it("should reject revoked refresh token", async () => {
      const { email, rawPassword } = await userFactory.createWithMembership(
        PlatformRole.INVESTOR,
        { email: "revoked.refresh@evzone.test" },
      );

      const loginRes = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: rawPassword })
        .expect(200);

      // Logout revokes tokens
      await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("should revoke all refresh tokens for the user", async () => {
      const { email, rawPassword } = await userFactory.createWithMembership(
        PlatformRole.INVESTOR,
        { email: "logout.test@evzone.test" },
      );

      const loginRes = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: rawPassword })
        .expect(200);

      await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
        .expect(200);

      const tokens = await prisma.refreshToken.findMany({
        where: { userId: loginRes.body.user.id, revokedAt: null },
      });
      expect(tokens).toHaveLength(0);
    });
  });
});
