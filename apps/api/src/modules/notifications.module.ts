import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { NotificationType, Prisma } from "@prisma/client";
import { AuthenticatedUser, CurrentUser } from "@evzone/common";
import { PrismaService } from "@evzone/database";

class CreateNotificationDto {
  @IsString()
  userId!: string;

  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsOptional()
  data?: Prisma.InputJsonValue;
}

@Injectable()
class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(user: AuthenticatedUser): Promise<unknown[]> {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getUnreadCount(user: AuthenticatedUser): Promise<{ count: number }> {
    return {
      count: await this.prisma.notification.count({
        where: { userId: user.id, readAt: null },
      }),
    };
  }

  async markAsRead(id: string, user: AuthenticatedUser): Promise<unknown> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.userId !== user.id)
      throw new NotFoundException("Notification not found");
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(user: AuthenticatedUser): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }

  async create(
    dto: CreateNotificationDto,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.prisma.notification.create({
      data: {
        tenantId: user.tenantId,
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        data: dto.data,
      },
    });
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.userId !== user.id)
      throw new NotFoundException("Notification not found");
    await this.prisma.notification.delete({ where: { id } });
  }
}

@ApiTags("Notifications")
@ApiBearerAuth()
@Controller("notifications")
class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findByUser(@CurrentUser() user: AuthenticatedUser): Promise<unknown[]> {
    return this.notificationsService.findByUser(user);
  }

  @Get("unread-count")
  getUnreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.notificationsService.getUnreadCount(user);
  }

  @Patch("read-all")
  markAllAsRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.notificationsService.markAllAsRead(user);
  }

  @Patch(":id/read")
  markAsRead(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.notificationsService.markAsRead(id, user);
  }

  @Post()
  @ApiOperation({ summary: "Create notification for system/admin use" })
  create(
    @Body() dto: CreateNotificationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.notificationsService.create(dto, user);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.notificationsService.delete(id, user);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
