import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { RedisService } from "@evzone/redis";
import { ConfigService } from "@nestjs/config";

interface RateLimitOptions {
  ttl: number;
  limit: number;
}

@Injectable()
export class RedisRateLimitMiddleware implements NestMiddleware {
  private readonly defaultOptions: RateLimitOptions = {
    ttl: 60,
    limit: 100,
  };

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const route = req.route?.path || req.originalUrl;
    const key = `rate-limit:${ip}:${route}`;

    const ttl = this.config.get<number>("redis.rateLimitTtl") ?? this.defaultOptions.ttl;
    const limit = this.config.get<number>("redis.rateLimit") ?? this.defaultOptions.limit;

    const count = await this.redis.incrementWithTtl(key, ttl);

    if (count > limit) {
      const error = new Error("Too many requests");
      (error as any).status = 429;
      return next(error);
    }

    next();
  }
}