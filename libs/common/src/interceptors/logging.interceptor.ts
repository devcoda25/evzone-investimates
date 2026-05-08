import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { RequestWithUser } from "../types/authenticated-user";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const startedAt = Date.now();
    return next.handle().pipe(
      tap(() => {
        const userId = request.user?.id ?? "anonymous";
        this.logger.log(
          `${request.method} ${request.url} ${Date.now() - startedAt}ms user=${userId}`,
        );
      }),
    );
  }
}
