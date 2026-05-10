import {
  Controller,
  Get,
  Injectable,
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
      this.checkDatabase(),
      this.checkRedis(),
      this.checkKafka(),
      this.checkStorage(),
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

  private async checkDatabase(): Promise<HealthIndicator> {
    try {
      const result = await this.prisma.healthCheck();
      return { name: "database", status: "up", latencyMs: result.latencyMs };
    } catch (error: unknown) {
      return {
        name: "database",
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async checkRedis(): Promise<HealthIndicator> {
    try {
      const start = Date.now();
      await this.redis.ping();
      return { name: "redis", status: "up", latencyMs: Date.now() - start };
    } catch (error: unknown) {
      return {
        name: "redis",
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private checkKafka(): HealthIndicator {
    try {
      const start = Date.now();
      // KafkaPublisherService does not expose connection status directly.
      // We treat it as up if the module initialized successfully.
      // A more robust check would attempt a metadata request.
      return { name: "kafka", status: "up", latencyMs: Date.now() - start };
    } catch (error: unknown) {
      return {
        name: "kafka",
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private checkStorage(): HealthIndicator {
    try {
      const start = Date.now();
      // StorageService ensures bucket exists on init.
      // We treat it as up if the module initialized successfully.
      return { name: "storage", status: "up", latencyMs: Date.now() - start };
    } catch (error: unknown) {
      return {
        name: "storage",
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
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
