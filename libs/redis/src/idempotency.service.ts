import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "./redis.service";

export interface IdempotencyWindow {
  key: string;
  ttlSeconds: number;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  constructor(private readonly redis: RedisService) {}

  /**
   * Attempts to acquire an idempotency lock for the given key.
   * Returns true if this is the first request (lock acquired),
   * false if a request with this key is already in flight.
   */
  async acquire(key: string, ttlSeconds = 300): Promise<boolean> {
    const completed = await this.getResult(key);
    if (completed) {
      this.logger.warn(`Idempotency key already completed: ${key}`);
      return false;
    }
    const acquired = await this.redis.setIfAbsent(
      `idempotency:${key}`,
      "in-flight",
      ttlSeconds,
    );
    if (!acquired) {
      this.logger.warn(`Idempotency key already in use: ${key}`);
    }
    return acquired;
  }

  /**
   * Marks an idempotency key as completed with a stored result.
   * This allows subsequent duplicate requests to return the same result.
   */
  async complete<T>(key: string, result: T, ttlSeconds = 300): Promise<void> {
    await this.redis.setJson(
      `idempotency:result:${key}`,
      { status: "completed", result, completedAt: new Date().toISOString() },
      ttlSeconds,
    );
  }

  /**
   * Retrieves a completed idempotency result if it exists.
   */
  async getResult<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(`idempotency:result:${key}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { status: string; result: T };
      if (parsed.status === "completed") return parsed.result;
    } catch {
      // ignore parse errors
    }
    return null;
  }

  /**
   * Releases an idempotency lock. Call this after complete() or on error.
   */
  async release(key: string): Promise<void> {
    await this.redis.del(`idempotency:${key}`);
  }
}
