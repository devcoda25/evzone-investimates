import { Injectable } from "@nestjs/common";
import { OutboxStatus, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "@evzone/database";
import { DomainEventInput } from "./types";

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: Prisma.TransactionClient,
    input: DomainEventInput,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        tenantId: input.tenantId,
        topic: input.topic,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventKey: `${input.eventType}:${input.aggregateId}:${randomUUID()}`,
        payload: input.payload,
      },
    });
  }

  async findPending(limit: number): Promise<
    Array<{
      id: string;
      topic: string;
      eventKey: string;
      payload: Prisma.JsonValue;
    }>
  > {
    return this.prisma.outboxEvent.findMany({
      where: { status: OutboxStatus.PENDING },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, topic: true, eventKey: true, payload: true },
    });
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markFailed(id: string, error: Error): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.FAILED,
        attempts: { increment: 1 },
        lastError: error.message,
      },
    });
  }
}
