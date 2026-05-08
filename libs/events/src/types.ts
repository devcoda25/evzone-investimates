import { Prisma } from "@prisma/client";

export interface DomainEventInput {
  tenantId?: string;
  topic: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
}
