import { Injectable } from "@nestjs/common";
import { OutboxStatus, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "@evzone/database";
import { DomainEventInput } from "./types";

export interface PendingOutboxEvent {
  id: string;
  topic: string;
  eventType: string;
  eventKey: string;
  payload: Prisma.JsonValue;
}

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: Prisma.TransactionClient | PrismaService,
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

  async createMany(
    tx: Prisma.TransactionClient | PrismaService,
    inputs: DomainEventInput[],
  ): Promise<void> {
    await tx.outboxEvent.createMany({
      data: inputs.map((input) => ({
        tenantId: input.tenantId,
        topic: input.topic,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventKey: `${input.eventType}:${input.aggregateId}:${randomUUID()}`,
        payload: input.payload,
      })),
    });
  }

  async findPending(limit: number): Promise<PendingOutboxEvent[]> {
    const now = new Date();
    return this.prisma.outboxEvent.findMany({
      where: {
        OR: [
          { status: OutboxStatus.PENDING },
          {
            status: OutboxStatus.FAILED,
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        topic: true,
        eventType: true,
        eventKey: true,
        payload: true,
      },
    });
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
        lastError: null,
        nextAttemptAt: null,
      },
    });
  }

  async markFailed(id: string, error: Error): Promise<void> {
    const current = await this.prisma.outboxEvent.findUnique({
      where: { id },
      select: { attempts: true },
    });
    const attempts = (current?.attempts ?? 0) + 1;
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.FAILED,
        attempts: { increment: 1 },
        lastError: error.message,
        nextAttemptAt: this.computeRetryAt(attempts),
      },
    });
  }

  private computeRetryAt(attempts: number): Date {
    const delaySeconds = Math.min(30 * 2 ** Math.max(attempts - 1, 0), 900);
    return new Date(Date.now() + delaySeconds * 1000);
  }
}
