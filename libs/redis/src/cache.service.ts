import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { RedisService } from "./redis.service";

export interface CacheServiceInterface {
  get(key: string): Promise<string | null>;
  getJson<T>(key: string): Promise<T | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  setIfAbsent(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  incrementWithTtl(key: string, ttlSeconds: number): Promise<number>;
  acquireLock(key: string, ttlSeconds?: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
}

@Injectable()
export class CacheService implements CacheServiceInterface, OnModuleDestroy {
  private readonly PREFIX = "evzone:cache:";
  private readonly LOCK_PREFIX = "evzone:lock:";
  private readonly DEFAULT_TTL = 300; // 5 minutes

  constructor(private readonly redis: RedisService) {}

  onModuleDestroy(): void {
    // RedisService handles disconnect
  }

  private key(name: string): string {
    return `${this.PREFIX}${name}`;
  }

  private lockKey(name: string): string {
    return `${this.LOCK_PREFIX}${name}`;
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(this.key(key));
  }

  async getJson<T>(key: string): Promise<T | null> {
    return this.redis.getJson<T>(this.key(key));
  }

  async set(key: string, value: string, ttlSeconds: number = this.DEFAULT_TTL): Promise<void> {
    await this.redis.setJson(this.key(key), value, ttlSeconds);
  }

  async setJson(key: string, value: unknown, ttlSeconds: number = this.DEFAULT_TTL): Promise<void> {
    await this.redis.setJson(this.key(key), value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(this.key(key));
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number = this.DEFAULT_TTL): Promise<boolean> {
    return this.redis.setIfAbsent(this.key(key), value, ttlSeconds);
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    return this.redis.incrementWithTtl(this.key(key), ttlSeconds);
  }

  /**
   * Acquire a distributed lock. Returns true if acquired, false if already held.
   * Default TTL is 30 seconds to prevent deadlocks.
   */
  async acquireLock(key: string, ttlSeconds: number = 30): Promise<boolean> {
    return this.redis.setIfAbsent(this.lockKey(key), "1", ttlSeconds);
  }

  /**
   * Release a distributed lock.
   */
  async releaseLock(key: string): Promise<void> {
    await this.redis.del(this.lockKey(key));
  }

  /**
   * Get or set with a factory function. Acquires a lock during computation
   * to prevent cache stampede.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number = this.DEFAULT_TTL,
  ): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) return cached;

    const lockKey = `compute:${key}`;
    const acquired = await this.acquireLock(lockKey, 10);

    if (!acquired) {
      // Another process is computing — wait briefly and return cached
      await new Promise((r) => setTimeout(r, 200));
      const retry = await this.getJson<T>(key);
      if (retry !== null) return retry;
    }

    try {
      const value = await factory();
      await this.setJson(key, value, ttlSeconds);
      return value;
    } finally {
      await this.releaseLock(lockKey);
    }
  }
}