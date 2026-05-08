import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Message } from './entities/message.entity';
import { SendMessageDto } from './dto/send-message.dto';

export interface ConversationPreview {
  partnerId: string;
  partnerName: string;
  lastMessage: Message;
  unreadCount: number;
}

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  async findConversations(userId: string): Promise<ConversationPreview[]> {
    const messages = await this.messageRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.sender', 'sender')
      .leftJoinAndSelect('msg.recipient', 'recipient')
      .where('msg.senderId = :userId OR msg.recipientId = :userId', { userId })
      .orderBy('msg.createdAt', 'DESC')
      .getMany();

    const conversationMap = new Map<string, { messages: Message[]; partnerId: string }>();

    for (const msg of messages) {
      const partnerId = msg.senderId === userId ? msg.recipientId : msg.senderId;
      if (!conversationMap.has(partnerId)) {
        conversationMap.set(partnerId, { messages: [], partnerId });
      }
      conversationMap.get(partnerId)!.messages.push(msg);
    }

    const result: ConversationPreview[] = [];
    for (const [, conv] of conversationMap) {
      const lastMessage = conv.messages[0];
      const unreadCount = conv.messages.filter(
        (m) => m.recipientId === userId && !m.read,
      ).length;

      const partner = lastMessage.senderId === userId
        ? lastMessage.recipient
        : lastMessage.sender;

      result.push({
        partnerId: conv.partnerId,
        partnerName: partner ? `${partner.firstName} ${partner.lastName}` : 'Unknown',
        lastMessage,
        unreadCount,
      });
    }

    return result;
  }

  async findConversation(userId: string, otherUserId: string): Promise<Message[]> {
    return this.messageRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.sender', 'sender')
      .leftJoinAndSelect('msg.recipient', 'recipient')
      .leftJoinAndSelect('msg.project', 'project')
      .where(
        '(msg.senderId = :userId AND msg.recipientId = :otherUserId) OR (msg.senderId = :otherUserId AND msg.recipientId = :userId)',
        { userId, otherUserId },
      )
      .orderBy('msg.createdAt', 'ASC')
      .getMany();
  }

  async send(userId: string, dto: SendMessageDto): Promise<Message> {
    const message = this.messageRepo.create({
      senderId: userId,
      recipientId: dto.recipientId,
      content: dto.content,
      projectId: dto.projectId ?? undefined,
      read: false,
    } as any);
    const saved = await this.messageRepo.save(message);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  async markAsRead(userId: string, messageId: string): Promise<Message> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
      relations: ['sender', 'recipient'],
    });
    if (!message) throw new NotFoundException(`Message with ID "${messageId}" not found`);
    if (message.recipientId !== userId) {
      throw new ForbiddenException('You can only mark your own received messages as read');
    }
    message.read = true;
    message.readAt = new Date();
    return this.messageRepo.save(message);
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.messageRepo.count({
      where: { recipientId: userId, read: false },
    });
    return { count };
  }
}
