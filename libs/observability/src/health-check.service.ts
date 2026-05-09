import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@evzone/database";
import { RedisService } from "@evzone/redis";
import { KafkaPublisherService } from "@evzone/events";

@Injectable()
export class HealthCheckService implements OnModuleInit, OnModuleDestroy {
  private checks: Map<string, () => Promise<{ status: string; message?: string }>> = new Map();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kafkaPublisher: KafkaPublisherService,
  ) {}

  onModuleInit(): void {
    // Register built-in health checks
    this.register("database", this.databaseCheck.bind(this));
    this.register("redis", this.redisCheck.bind(this));
    this.register("kafka", this.kafkaCheck.bind(this));
    this.register("storage", this.storageCheck.bind(this));
  }

  onModuleDestroy(): void {
    this.checks.clear();
  }

  register(name: string, check: () => Promise<{ status: string; message?: string }>): void {
    this.checks.set(name, check);
  }

  deregister(name: string): void {
    this.checks.delete(name);
  }

  async check(name?: string): Promise<{ status: string; checks: Record<string, { status: string; message?: string; timestamp: string }>; timestamp: string }> {
    const timestamp = new Date().toISOString();

    if (name) {
      const check = this.checks.get(name);
      if (!check) {
        return {
          status: "error",
          checks: { [name]: { status: "not_found", timestamp } },
          timestamp,
        };
      }
      const result = await check();
      return {
        status: result.status,
        checks: { [name]: { ...result, timestamp } },
        timestamp,
      };
    }

    const results: Record<string, { status: string; message?: string; timestamp: string }> = {};
    let overallStatus: string = "healthy";

    for (const [checkName, checkFn] of this.checks) {
      try {
        const result = await checkFn();
        results[checkName] = { ...result, timestamp };
        if (result.status !== "healthy") {
          overallStatus = "degraded";
        }
      } catch (err: any) {
        results[checkName] = { status: "unhealthy", message: err.message, timestamp };
        overallStatus = "unhealthy";
      }
    }

    return {
      status: overallStatus,
      checks: results,
      timestamp,
    };
  }

  private async databaseCheck(): Promise<{ status: string; message?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "healthy", message: "Database connection established" };
    } catch (err: any) {
      return { status: "unhealthy", message: err.message };
    }
  }

  private async redisCheck(): Promise<{ status: string; message?: string }> {
    try {
      await this.redis.getClient();
      await this.redis.set("health:check", "ok", 5);
      const val = await this.redis.get("health:check");
      if (val !== "ok") throw new Error("Redis read/write verification failed");
      return { status: "healthy", message: "Redis connection established" };
    } catch (err: any) {
      return { status: "unhealthy", message: err.message };
    }
  }

  private async kafkaCheck(): Promise<{ status: string; message?: string }> {
    try {
      // Attempt to get producer metadata to verify connectivity
      await this.kafkaPublisher.publish("health-check", `health-${Date.now()}`, { ping: true });
      return { status: "healthy", message: "Kafka connection established" };
    } catch (err: any) {
      return { status: "unhealthy", message: err.message };
    }
  }

  private async storageCheck(): Promise<{ status: string; message?: string }> {
    try {
      const endpoint = this.config.get<string>("storage.endpoint");
      const bucket = this.config.get<string>("storage.bucket");
      if (!endpoint || !bucket) {
        return { status: "unhealthy", message: "Storage endpoint or bucket not configured" };
      }
      return { status: "healthy", message: `Object storage configured (${bucket})` };
    } catch (err: any) {
      return { status: "unhealthy", message: err.message };
    }
  }
}