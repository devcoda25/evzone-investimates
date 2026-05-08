import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { CurrentUser } from '@common/decorators/current-user.decorator';
import { OidcAuthGuard } from '@common/guards/oidc-auth.guard';

import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Messaging')
@ApiBearerAuth()
@UseGuards(OidcAuthGuard)
@Controller('messages')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Get my conversations grouped by partner' })
  @ApiResponse({ status: 200, description: 'Conversations returned' })
  async findConversations(@CurrentUser('id') userId: string) {
    return this.messagingService.findConversations(userId);
  }

  @Get('conversations/:userId')
  @ApiOperation({ summary: 'Get message thread with a specific user' })
  @ApiResponse({ status: 200, description: 'Message thread returned' })
  async findConversation(
    @CurrentUser('id') userId: string,
    @Param('userId', ParseUUIDPipe) otherUserId: string,
  ) {
    return this.messagingService.findConversation(userId, otherUserId);
  }

  @Post()
  @ApiOperation({ summary: 'Send a message' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  async send(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.send(userId, dto);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark message as read' })
  @ApiResponse({ status: 200, description: 'Message marked as read' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messagingService.markAsRead(userId, id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread message count' })
  @ApiResponse({ status: 200, description: 'Unread count returned' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.messagingService.getUnreadCount(userId);
  }
}
