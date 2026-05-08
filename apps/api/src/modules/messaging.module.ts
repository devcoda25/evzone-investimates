import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser, CurrentUser } from "@evzone/common";
import { PrismaService } from "@evzone/database";

class SendMessageDto {
  @IsString()
  recipientId!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body!: string;

  @IsOptional()
  attachments?: Prisma.InputJsonValue;
}

@Injectable()
class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  async findConversations(user: AuthenticatedUser): Promise<unknown[]> {
    const messages = await this.prisma.message.findMany({
      where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
      include: { sender: true, recipient: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const byPartner = new Map<string, unknown>();
    for (const message of messages) {
      const partnerId =
        message.senderId === user.id ? message.recipientId : message.senderId;
      if (!byPartner.has(partnerId)) {
        byPartner.set(partnerId, { partnerId, lastMessage: message });
      }
    }
    return Array.from(byPartner.values());
  }

  async findConversation(
    user: AuthenticatedUser,
    otherUserId: string,
  ): Promise<unknown[]> {
    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: user.id },
        ],
      },
      include: { sender: true, recipient: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async send(user: AuthenticatedUser, dto: SendMessageDto): Promise<unknown> {
    return this.prisma.message.create({
      data: {
        senderId: user.id,
        recipientId: dto.recipientId,
        subject: dto.subject,
        body: dto.body,
        attachments: dto.attachments,
      },
    });
  }

  async markAsRead(user: AuthenticatedUser, id: string): Promise<unknown> {
    const message = await this.prisma.message.findUnique({ where: { id } });
    if (!message || message.recipientId !== user.id)
      throw new NotFoundException("Message not found");
    return this.prisma.message.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async getUnreadCount(user: AuthenticatedUser): Promise<{ count: number }> {
    return {
      count: await this.prisma.message.count({
        where: { recipientId: user.id, readAt: null },
      }),
    };
  }
}

@ApiTags("Messaging")
@ApiBearerAuth()
@Controller("messages")
class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get("conversations")
  findConversations(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.messagingService.findConversations(user);
  }

  @Get("conversations/:userId")
  findConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId") otherUserId: string,
  ): Promise<unknown[]> {
    return this.messagingService.findConversation(user, otherUserId);
  }

  @Post()
  @ApiOperation({ summary: "Send an internal platform message" })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ): Promise<unknown> {
    return this.messagingService.send(user, dto);
  }

  @Patch(":id/read")
  markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.messagingService.markAsRead(user, id);
  }

  @Get("unread-count")
  getUnreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.messagingService.getUnreadCount(user);
  }
}

@Module({
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
