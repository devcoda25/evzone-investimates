import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@evzone/database";
import { AuditLogInput } from "./types";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: AuditLogInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValues: input.oldValues,
        newValues: input.newValues,
        metadata: input.metadata,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  async recordFromRequest(
    req: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      user?: any;
    },
    action: string,
    entityType: string,
    entityId: string,
    oldValues?: Prisma.InputJsonValue,
    newValues?: Prisma.InputJsonValue,
    metadata?: Prisma.InputJsonValue,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const headers = req.headers ?? {};
    const forwardedFor = headers["x-forwarded-for"];
    const ipAddress = req.ip ?? (typeof forwardedFor === "string" ? forwardedFor : forwardedFor?.[0]);
    const input: AuditLogInput = {
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      action,
      entityType,
      entityId,
      oldValues,
      newValues,
      metadata,
      ipAddress: ipAddress as string | undefined,
      userAgent: headers["user-agent"] as string | undefined,
    };
    await this.record(input, tx);
  }
}
