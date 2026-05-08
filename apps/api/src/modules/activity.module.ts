import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString } from "class-validator";
import { AuthenticatedUser, CurrentUser } from "@evzone/common";
import { PrismaService } from "@evzone/database";

class ActivityFilterDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsInt()
  limit?: number;
}

interface ActivityItemResponse {
  id: string;
  type: string;
  title: string;
  detail: string;
  metadata: unknown;
  timestamp: Date;
}

@Injectable()
class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(
    user: AuthenticatedUser,
    filter: ActivityFilterDto,
  ): Promise<ActivityItemResponse[]> {
    const limit = filter.limit ?? 50;
    const where: Record<string, unknown> = { userId: user.id };
    if (filter.type) {
      where.type = filter.type;
    }

    const events = await this.prisma.activityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return events.map((event) => ({
      id: event.id,
      type: event.type,
      title: event.title,
      detail: event.detail,
      metadata: event.metadata,
      timestamp: event.createdAt,
    }));
  }

  async createEvent(
    tenantId: string,
    userId: string,
    type: string,
    title: string,
    detail: string,
    metadata?: unknown,
  ): Promise<void> {
    await this.prisma.activityEvent.create({
      data: {
        tenantId,
        userId,
        type,
        title,
        detail,
        metadata: metadata ?? {},
      },
    });
  }
}

@ApiTags("Activity")
@ApiBearerAuth()
@Controller("activity")
class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @ApiOperation({ summary: "Get recent activity feed for current user" })
  findByUser(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: ActivityFilterDto,
  ): Promise<ActivityItemResponse[]> {
    return this.activityService.findByUser(user, filter);
  }
}

@Module({
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
