import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const url = request.url;
    const now = Date.now();
    const userAgent = request.get('user-agent') || 'unknown';
    const ip = request.ip;
    const userId = (request as any).user?.id || 'anonymous';

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const duration = Date.now() - now;
          this.logger.log(
            `${method} ${url} ${statusCode} — ${duration}ms — User:${userId} — ${ip} — ${userAgent}`,
          );
        },
        error: (error) => {
          const statusCode = error.status || 500;
          const duration = Date.now() - now;
          this.logger.error(
            `${method} ${url} ${statusCode} — ${duration}ms — User:${userId} — ${ip} — ${error.message}`,
          );
        },
      }),
    );
  }
}
