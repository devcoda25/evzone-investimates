import "reflect-metadata";
import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import {
  AllExceptionsFilter,
  LoggingInterceptor,
  TransformInterceptor,
} from "@evzone/common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log", "debug", "verbose"],
  });
  const config = app.get(ConfigService);
  const port = config.get<number>("app.port") ?? 3000;
  const apiPrefix = config.get<string>("app.apiPrefix") ?? "api";
  const nodeEnv = config.get<string>("app.nodeEnv") ?? "development";

  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === "production",
      crossOriginEmbedderPolicy: nodeEnv === "production",
    }),
  );

  const corsOrigins = [
    config.get<string>("app.frontendInvestorUrl"),
    config.get<string>("app.frontendEntrepreneurUrl"),
    config.get<string>("app.frontendAssessorUrl"),
    config.get<string>("app.frontendAdminUrl"),
  ].filter((value): value is string => Boolean(value));

  const isLocalhost = (url: string): boolean => {
    try {
      return new URL(url).hostname === "localhost";
    } catch {
      return false;
    }
  };

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Allow configured origins and localhost in development
      const allowed = corsOrigins.some(
        (o) => o === origin || (nodeEnv === "development" && isLocalhost(origin)),
      );
      if (allowed) return callback(null, true);
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Idempotency-Key",
    ],
  });

  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor(),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("EVzone Platform API")
    .setDescription(
      "REST API for investors, entrepreneurs, assessors, admins, compliance, media, and investments.",
    )
    .setVersion("1.0.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "access-token",
    )
    .build();
  SwaggerModule.setup(
    "docs",
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    {
      swaggerOptions: { persistAuthorization: true },
    },
  );

  await app.listen(port);
  new Logger("Bootstrap").log(
    `EVzone API listening on http://localhost:${port}/${apiPrefix}/v1`,
  );
}

void bootstrap();
