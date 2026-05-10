import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { UnifiedAuthGuard } from '@common/guards/unified-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles, UserRole } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import {
  SendMessageDto,
  GetConversationsDto,
  MarkAsReadDto,
} from './dto';
import { PaginatedResponse } from '@common/dto/pagination.dto';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(UnifiedAuthGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // Send a new message
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a new message' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Message sent successfully' })
  async sendMessage(
    @CurrentUser('id') senderId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(senderId, dto);
  }

  // Get conversations for the current user
  @Get('conversations')
  @ApiOperation({ summary: 'Get conversations for the current user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Conversations returned' })
  async getConversations(
    @CurrentUser('id') userId: string,
    @Query() filter: GetConversationsDto,
  ): Promise<PaginatedResponse<any>> {
    return this.messagesService.getConversations(userId, filter);
  }

  // Get messages in a conversation
  @Get('conversations/:conversationId')
  @ApiParam({ name: 'conversationId', description: 'Conversation ID (user ID of the other party)' })
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Messages returned' })
  async getConversationMessages(
    @CurrentUser('id') userId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() filter: GetConversationsDto,
  ): Promise<PaginatedResponse<any>> {
    return this.messagesService.getConversationMessages(userId, conversationId, filter);
  }

  // Mark messages as read
  @Patch('mark-as-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark messages as read' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Messages marked as read' })
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Body() dto: MarkAsReadDto,
  ) {
    return this.messagesService.markAsRead(userId, dto);
  }

  // Delete a message (soft delete)
  @Delete(':id')
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiOperation({ summary: 'Delete a message' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Message deleted' })
  async deleteMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messagesService.deleteMessage(userId, id);
  }
}