import {
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "@evzone/database";
import { RedisService } from "@evzone/redis";
import { KafkaPublisherService } from "@evzone/events";
import { StorageService } from "@evzone/storage";
import { Public } from "@evzone/common";
import { ApiTags } from "@nestjs/swagger";

interface HealthIndicator {
  name: string;
  status: "up" | "down";
  latencyMs?: number;
  error?: string;
}

@Injectable()
class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kafka: KafkaPublisherService,
    private readonly storage: StorageService,
  ) {}

  async check(): Promise<{
    status: string;
    timestamp: string;
    checks: HealthIndicator[];
  }> {
    const checks: HealthIndicator[] = await Promise.all([
      this.withTimeout(this.checkDatabase(), 5000, "database"),
      this.withTimeout(this.checkRedis(), 5000, "redis"),
      this.withTimeout(this.checkKafka(), 5000, "kafka"),
      this.withTimeout(this.checkStorage(), 5000, "storage"),
    ]);

    const allUp = checks.every((c) => c.status === "up");
    if (!allUp) {
      const down = checks.filter((c) => c.status === "down");
      throw new ServiceUnavailableException({
        status: "error",
        timestamp: new Date().toISOString(),
        checks,
        message: `Health check failed: ${down.map((d) => d.name).join(", ")}`,
      });
    }

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async withTimeout(
    probe: Promise<HealthIndicator>,
    timeoutMs: number,
    name: string,
  ): Promise<HealthIndicator> {
    const timeoutPromise = new Promise<HealthIndicator>((resolve) => {
      setTimeout(() => {
        resolve({
          name,
          status: "down",
          error: `Health check timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);
    });

    return Promise.race([probe, timeoutPromise]);
  }

  private async checkDatabase(): Promise<HealthIndicator> {
    try {
      const result = await this.prisma.healthCheck();
      return { name: "database", status: "up", latencyMs: result.latencyMs };
    } catch (error: unknown) {
      this.logger.error(
        `Database health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return {
        name: "database",
        status: "down",
        error: "Dependency unavailable",
      };
    }
  }

  private async checkRedis(): Promise<HealthIndicator> {
    try {
      const start = Date.now();
      await this.redis.ping();
      return { name: "redis", status: "up", latencyMs: Date.now() - start };
    } catch (error: unknown) {
      this.logger.error(
        `Redis health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return {
        name: "redis",
        status: "down",
        error: "Dependency unavailable",
      };
    }
  }

  private async checkKafka(): Promise<HealthIndicator> {
    try {
      const start = Date.now();
      await this.kafka.healthCheck();
      return { name: "kafka", status: "up", latencyMs: Date.now() - start };
    } catch (error: unknown) {
      this.logger.error(
        `Kafka health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return {
        name: "kafka",
        status: "down",
        error: "Dependency unavailable",
      };
    }
  }

  private async checkStorage(): Promise<HealthIndicator> {
    try {
      const start = Date.now();
      await this.storage.healthCheck();
      return { name: "storage", status: "up", latencyMs: Date.now() - start };
    } catch (error: unknown) {
      this.logger.error(
        `Storage health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return {
        name: "storage",
        status: "down",
        error: "Dependency unavailable",
      };
    }
  }
}

@ApiTags("Health")
@Controller("health")
class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  check(): Promise<{ status: string; timestamp: string; checks: HealthIndicator[] }> {
    return this.healthService.check();
  }

  @Public()
  @Get("liveness")
  liveness(): { status: string; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
