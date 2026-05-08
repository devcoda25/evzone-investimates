import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected to PostgreSQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  /**
   * Execute operations inside a transaction
   */
  async runTransaction<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => fn(tx as unknown as PrismaClient));
  }

  /**
   * Soft delete helper — sets deletedAt instead of removing row
   */
  async softDelete<
    T extends { update: (args: any) => Promise<any> },
  >(model: T, where: Record<string, any>): Promise<void> {
    await (model as any).update({
      where,
      data: { deletedAt: new Date() },
    });
  }
}
