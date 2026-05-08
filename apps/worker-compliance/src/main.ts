import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { ComplianceCaseStatus } from "@prisma/client";
import { configuration } from "@evzone/config";
import { PrismaModule, PrismaService } from "@evzone/database";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
  ],
})
class WorkerComplianceModule {}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerCompliance");
  const app = await NestFactory.createApplicationContext(
    WorkerComplianceModule,
    { logger: ["error", "warn", "log"] },
  );
  const prisma = app.get(PrismaService);
  logger.log("Compliance worker started");
  let running = true;

  process.on("SIGTERM", () => {
    running = false;
    void app.close();
  });

  while (running) {
    const cases = await prisma.complianceCase.findMany({
      where: { status: ComplianceCaseStatus.OPEN },
      take: 25,
      orderBy: { createdAt: "asc" },
    });
    for (const complianceCase of cases) {
      await prisma.complianceCase.update({
        where: { id: complianceCase.id },
        data: {
          status: ComplianceCaseStatus.MANUAL_REVIEW,
          reason:
            complianceCase.reason ?? "Queued for manual compliance review",
        },
      });
      logger.log(
        `Queued compliance case for manual review: ${complianceCase.id}`,
      );
    }
    await sleep(cases.length > 0 ? 1_000 : 10_000);
  }
}

void bootstrap();
