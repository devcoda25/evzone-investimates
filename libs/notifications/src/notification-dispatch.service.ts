import { Injectable } from "@nestjs/common";
import { NotificationDispatchStatus, Prisma } from "@prisma/client";
import { PrismaService } from "@evzone/database";
import { PendingOutboxEvent } from "@evzone/events";
import { NotificationDeliveryService } from "./notification-delivery.service";

export interface PendingNotificationDispatch {
  id: string;
  eventKey: string;
  eventType: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

@Injectable()
export class NotificationDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async enqueueFromEvent(event: PendingOutboxEvent): Promise<boolean> {
    if (!this.delivery.supportsEventType(event.eventType)) {
      return false;
    }

    await this.prisma.notificationDispatch.upsert({
      where: { eventKey: event.eventKey },
      update: {},
      create: {
        eventKey: event.eventKey,
        eventType: event.eventType,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });

    return true;
  }

  async findReady(limit: number): Promise<PendingNotificationDispatch[]> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 5 * 60 * 1000);

    return this.prisma.notificationDispatch.findMany({
      where: {
        OR: [
          { status: NotificationDispatchStatus.PENDING },
          {
            status: NotificationDispatchStatus.FAILED,
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          {
            status: NotificationDispatchStatus.PROCESSING,
            processingStartedAt: { lte: staleThreshold },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        eventKey: true,
        eventType: true,
        payload: true,
        attempts: true,
      },
    });
  }

  async markProcessing(id: string): Promise<boolean> {
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
    const result = await this.prisma.notificationDispatch.updateMany({
      where: {
        id,
        OR: [
          { status: NotificationDispatchStatus.PENDING },
          { status: NotificationDispatchStatus.FAILED },
          {
            status: NotificationDispatchStatus.PROCESSING,
            processingStartedAt: { lte: staleThreshold },
          },
        ],
      },
      data: {
        status: NotificationDispatchStatus.PROCESSING,
        processingStartedAt: new Date(),
        lastError: null,
      },
    });

    return result.count > 0;
  }

  async markSucceeded(id: string): Promise<void> {
    await this.prisma.notificationDispatch.update({
      where: { id },
      data: {
        status: NotificationDispatchStatus.SENT,
        processedAt: new Date(),
        processingStartedAt: null,
        nextAttemptAt: null,
        lastError: null,
      },
    });
  }

  async markFailed(id: string, error: Error): Promise<void> {
    const current = await this.prisma.notificationDispatch.findUnique({
      where: { id },
      select: { attempts: true },
    });
    const attempts = (current?.attempts ?? 0) + 1;

    await this.prisma.notificationDispatch.update({
      where: { id },
      data: {
        status: NotificationDispatchStatus.FAILED,
        attempts: { increment: 1 },
        lastError: error.message,
        nextAttemptAt: this.computeRetryAt(attempts),
        processingStartedAt: null,
      },
    });
  }

  private computeRetryAt(attempts: number): Date {
    const delaySeconds = Math.min(30 * 2 ** Math.max(attempts - 1, 0), 1800);
    return new Date(Date.now() + delaySeconds * 1000);
  }
}
