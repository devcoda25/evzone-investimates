import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { normalizePrisma } from '@database/prisma.helpers';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string): Promise<any[]> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return notifications.map((notification) => normalizePrisma(notification));
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, read: false, deletedAt: null },
    });
    return { count };
  }

  async markAsRead(userId: string, id: string): Promise<any> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, deletedAt: null },
    });
    if (!notification) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('You can only update your own notifications');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });

    return normalizePrisma(updated);
  }

  async markAllAsRead(userId: string): Promise<{ affected: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false, deletedAt: null },
      data: { read: true, readAt: new Date() },
    });
    return { affected: result.count };
  }

  async create(dto: CreateNotificationDto): Promise<any> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type as any,
        title: dto.title,
        message: dto.message,
        data: dto.data as Prisma.InputJsonValue | undefined,
        actionUrl: dto.actionUrl,
      },
    });

    return normalizePrisma(notification);
  }

  async softDelete(userId: string, id: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, deletedAt: null },
    });
    if (!notification) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('You can only delete your own notifications');
    }

    await this.prisma.notification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
