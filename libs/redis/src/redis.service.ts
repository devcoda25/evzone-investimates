import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>("redis.host") ?? "localhost",
      port: config.get<number>("redis.port") ?? 6379,
      password: config.get<string | undefined>("redis.password"),
      db: config.get<number>("redis.db") ?? 0,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.client.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return count;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  // ── OTP helpers ──

  async storeOtp(key: string, code: string, ttlSeconds: number = 300): Promise<void> {
    await this.client.set(`otp:${key}`, code, 'EX', ttlSeconds);
  }

  async verifyOtp(key: string, code: string): Promise<boolean> {
    const stored = await this.client.get(`otp:${key}`);
    if (stored === null) return false;
    if (stored === code) {
      await this.client.del(`otp:${key}`);
      return true;
    }
    return false;
  }

  async invalidateOtp(key: string): Promise<void> {
    await this.client.del(`otp:${key}`);
  }

  // ── Session helpers ──

  async storeSession(sessionId: string, data: unknown, ttlSeconds: number = 3600): Promise<void> {
    await this.client.set(`session:${sessionId}`, JSON.stringify(data), 'EX', ttlSeconds);
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    const value = await this.client.get(`session:${sessionId}`);
    return value ? JSON.parse(value) as T : null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.client.del(`session:${sessionId}`);
  }

  // ── Idempotency helpers ──

  async getIdempotency(key: string): Promise<string | null> {
    return this.client.get(`idem:${key}`);
  }

  async setIdempotency(key: string, result: string, ttlSeconds: number = 86400): Promise<void> {
    await this.client.set(`idem:${key}`, result, 'EX', ttlSeconds);
  }

  async deleteIdempotency(key: string): Promise<void> {
    await this.client.del(`idem:${key}`);
  }

  // ── Login attempt counter ──

  async incrementLoginAttempts(key: string, ttlSeconds: number = 900): Promise<number> {
    const count = await this.client.incr(`login-attempts:${key}`);
    if (count === 1) {
      await this.client.expire(`login-attempts:${key}`, ttlSeconds);
    }
    return count;
  }

  async resetLoginAttempts(key: string): Promise<void> {
    await this.client.del(`login-attempts:${key}`);
  }

  async getLoginAttempts(key: string): Promise<number> {
    const val = await this.client.get(`login-attempts:${key}`);
    return val ? parseInt(val, 10) : 0;
  }

  // ── Raw client access ──

  async getClient(): Promise<Redis> {
    return this.client;
  }
}
