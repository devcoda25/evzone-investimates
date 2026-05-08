import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { normalizePrisma } from '@database/prisma.helpers';
import { SendMessageDto, GetConversationsDto, MarkAsReadDto } from './dto';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(senderId: string, dto: SendMessageDto) {
    // Validate recipient exists
    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.recipientId, deletedAt: null },
    });

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    // Prevent sending messages to yourself
    if (senderId === dto.recipientId) {
      throw new ForbiddenException('Cannot send message to yourself');
    }

    const message = await this.prisma.message.create({
      data: {
        senderId,
        recipientId: dto.recipientId,
        projectId: dto.projectId,
        content: dto.content,
        attachments: dto.attachments,
      },
    });

    return normalizePrisma(message);
  }

  async getConversations(userId: string, filter: GetConversationsDto): Promise<any> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = filter.sortBy ?? 'lastMessageAt';
    const sortOrder = filter.sortOrder ?? 'desc';

    // Get distinct conversations with the latest message timestamp
    const conversations = await this.prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN "senderId" = ${userId} THEN "recipientId"
          ELSE "senderId"
        END as "userId",
        u."firstName",
        u."lastName",
        u."avatar",
        MAX("createdAt") as "lastMessageAt",
        COUNT(CASE WHEN "read" = false AND "recipientId" = ${userId} THEN 1 END) as "unreadCount"
      FROM "Message" m
      JOIN "User" u ON (
        CASE 
          WHEN "senderId" = ${userId} THEN "recipientId"
          ELSE "senderId"
        END
      ) = u."id"
      WHERE ("senderId" = ${userId} OR "recipientId" = ${userId})
        AND "deletedAt" IS NULL
      GROUP BY 
        CASE 
          WHEN "senderId" = ${userId} THEN "recipientId"
          ELSE "senderId"
        END,
        u."firstName",
        u."lastName",
        u."avatar"
      ORDER BY "lastMessageAt" DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;

    // Get total count
    const [totalResult] = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT 
        CASE 
          WHEN "senderId" = ${userId} THEN "recipientId"
          ELSE "senderId"
        END) as "count"
      FROM "Message" m
      WHERE ("senderId" = ${userId} OR "recipientId" = ${userId})
        AND "deletedAt" IS NULL
    `;

    const total = Number(totalResult.count);

    return {
      data: conversations,
      meta: {
        currentPage: page,
        itemCount: conversations.length,
        itemsPerPage: limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getConversationMessages(
    userId: string,
    conversationId: string,
    filter: GetConversationsDto,
  ): Promise<any> {
    // Validate that the conversation involves the current user
    const otherUser = await this.prisma.user.findUnique({
      where: { id: conversationId, deletedAt: null },
    });

    if (!otherUser) {
      throw new NotFoundException('User not found');
    }

    const conversationExists = await this.prisma.message.findFirst({
      where: {
        OR: [
          { senderId: userId, recipientId: conversationId },
          { senderId: conversationId, recipientId: userId },
        ],
        deletedAt: null,
      },
    });

    if (!conversationExists) {
      throw new NotFoundException('Conversation not found');
    }

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 50;
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'desc';

    const [messages, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId, recipientId: conversationId },
            { senderId: conversationId, recipientId: userId },
          ],
          deletedAt: null,
        },
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
          recipient: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.message.count({
        where: {
          OR: [
            { senderId: userId, recipientId: conversationId },
            { senderId: conversationId, recipientId: userId },
          ],
          deletedAt: null,
        },
      }),
    ]);

    // Mark messages as read when retrieved (if recipient is current user)
    await this.prisma.message.updateMany({
      where: {
        OR: [
          { senderId: conversationId, recipientId: userId },
        ],
        read: false,
        deletedAt: null,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    return {
      data: messages.map(normalizePrisma),
      meta: {
        currentPage: page,
        itemCount: messages.length,
        itemsPerPage: limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(userId: string, dto: MarkAsReadDto) {
    const { messageIds, conversationId } = dto;

    let whereClause: any = {
      recipientId: userId,
      read: false,
      deletedAt: null,
    };

    if (messageIds && messageIds.length > 0) {
      whereClause.id = { in: messageIds };
    } else if (conversationId) {
      // Validate conversation involves the user
      const otherUser = await this.prisma.user.findUnique({
        where: { id: conversationId, deletedAt: null },
      });

      if (!otherUser) {
        throw new NotFoundException('User not found');
      }

      whereClause.senderId = conversationId;
    } else {
      throw new Error('Either messageIds or conversationId must be provided');
    }

    const result = await this.prisma.message.updateMany({
      where: whereClause,
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    return { affected: result.count };
  }

  async deleteMessage(userId: string, id: string) {
    const message = await this.prisma.message.findFirst({
      where: { id, deletedAt: null },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user is sender or recipient
    if (message.senderId !== userId && message.recipientId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    await this.prisma.message.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }
}