import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('redis.host');
    this.enabled = !!host;

    if (!this.enabled) {
      this.logger.warn('Redis cache disabled: REDIS_HOST not configured');
    } else {
      this.logger.warn('Redis cache configured but ioredis is not installed. Run: npm install ioredis');
    }
  }

  onModuleInit() {
    // No-op
  }

  onModuleDestroy() {
    // No-op
  }

  async get<T>(key: string): Promise<T | null> {
    return null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    // No-op
  }

  async del(key: string): Promise<void> {
    // No-op
  }

  async delPattern(pattern: string): Promise<void> {
    // No-op
  }

  async exists(key: string): Promise<boolean> {
    return false;
  }

  async ttl(key: string): Promise<number> {
    return -1;
  }

  async increment(key: string, amount = 1): Promise<number> {
    return 0;
  }

  async expire(key: string, seconds: number): Promise<void> {
    // No-op
  }

  getRedisClient(): null {
    return null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
