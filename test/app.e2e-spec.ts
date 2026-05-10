import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../apps/api/src/app.module";


  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
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
  });

  it("/health (GET) should return ok", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200);

    expect(res.body.status).toBe("ok");
    expect(res.body.checks).toBeInstanceOf(Array);
    expect(res.body.checks.length).toBeGreaterThanOrEqual(1);
  });

  it("/health/liveness (GET) should return ok", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/health/liveness")
      .expect(200);

    expect(res.body.status).toBe("ok");
  });

  it("POST /auth/register without body should return 400", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({})
      .expect(400);
  });

  it("GET /auth/me without token should return 401", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .expect(401);
  });
});
