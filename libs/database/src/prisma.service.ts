import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly config: ConfigService) {
    const nodeEnv = config.get<string>("app.nodeEnv") ?? "development";
    const configUrl = config.get<string>("database.url");
    const url = configUrl && configUrl.trim().length > 0 ? configUrl : process.env.DATABASE_URL;
    const configDirectUrl = config.get<string>("database.directUrl");
    const directUrl =
      configDirectUrl && configDirectUrl.trim().length > 0 ? configDirectUrl : process.env.DIRECT_URL;

    super({
      datasources: {
        db: {
          url,
        },
      },
      log:
        nodeEnv === "development"
          ? ["error", "warn"]
          : ["error"],
    });

    // Attach directUrl for migration tooling if needed
    if (directUrl) {
      (this as unknown as Record<string, unknown>)["$directUrl"] = directUrl;
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async healthCheck(): Promise<{ status: string; latencyMs: number }> {
    const start = Date.now();
    await this.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - start };
  }
}
