import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = this.getStatus(exception);
    const body: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: this.getMessage(exception),
      error: this.getErrorName(exception),
    };

    if (status >= 500) {
      const message =
        exception instanceof Error ? exception.message : "Unknown error";
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(message, stack);
    }

    response.status(status).json(body);
  }

  private getStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") return HttpStatus.CONFLICT;
      if (exception.code === "P2025") return HttpStatus.NOT_FOUND;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getMessage(exception: unknown): string | string[] {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === "string") return response;
      if (this.hasMessage(response)) return response.message;
      return exception.message;
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002")
        return "A record with this unique value already exists";
      if (exception.code === "P2025") return "Record not found";
    }
    return "Internal server error";
  }

  private getErrorName(exception: unknown): string | undefined {
    if (exception instanceof HttpException) return exception.name;
    if (exception instanceof Prisma.PrismaClientKnownRequestError)
      return exception.code;
    return undefined;
  }

  private hasMessage(value: unknown): value is { message: string | string[] } {
    return typeof value === "object" && value !== null && "message" in value;
  }
}
