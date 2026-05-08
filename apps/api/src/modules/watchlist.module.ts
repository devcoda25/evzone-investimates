import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { AuthenticatedUser, CurrentUser } from "@evzone/common";
import { PrismaService } from "@evzone/database";
import { PermissionsService } from "@evzone/permissions";

class AddToWatchlistDto {
  @IsString()
  dealId!: string;
}

interface WatchlistItemResponse {
  id: string;
  dealId: string;
  title: string;
  category: string;
  location: string;
  targetAmount: string;
  raisedAmount: string;
  riskRating: string | null;
  irr: number | null;
  daysLeft: number | null;
  status: string;
  createdAt: Date;
}

@Injectable()
class WatchlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async findByUser(user: AuthenticatedUser): Promise<WatchlistItemResponse[]> {
    const items = await this.prisma.watchlistItem.findMany({
      where: { userId: user.id },
      include: {
        deal: {
          include: {
            project: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return items.map((item) => {
      const deal = item.deal;
      const project = deal.project;
      const daysLeft = deal.closesAt
        ? Math.max(0, Math.ceil((new Date(deal.closesAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;
      const raisedAmount = project.fundingRaised?.toString() ?? "0";
      const targetAmount = project.fundingTarget?.toString() ?? "0";

      return {
        id: item.id,
        dealId: deal.id,
        title: deal.title || project.title,
        category: project.sector,
        location: `${project.city || ""}, ${project.country || ""}`.replace(/^,\s*|,\s*$/g, "") || project.country || "",
        targetAmount,
        raisedAmount,
        riskRating: project.riskRating,
        irr: project.returnTarget ? Number(project.returnTarget) : null,
        daysLeft,
        status: deal.status,
        createdAt: item.createdAt,
      };
    });
  }

  async add(dto: AddToWatchlistDto, user: AuthenticatedUser): Promise<WatchlistItemResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dto.dealId },
      include: { project: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");

    const existing = await this.prisma.watchlistItem.findUnique({
      where: { userId_dealId: { userId: user.id, dealId: dto.dealId } },
    });
    if (existing) {
      throw new ConflictException("Already in watchlist");
    }

    const item = await this.prisma.watchlistItem.create({
      data: {
        userId: user.id,
        dealId: dto.dealId,
        tenantId: user.tenantId,
      },
      include: {
        deal: { include: { project: true } },
      },
    });

    const project = item.deal.project;
    const daysLeft = item.deal.closesAt
      ? Math.max(0, Math.ceil((new Date(item.deal.closesAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    return {
      id: item.id,
      dealId: item.dealId,
      title: item.deal.title || project.title,
      category: project.sector,
      location: `${project.city || ""}, ${project.country || ""}`.replace(/^,\s*|,\s*$/g, "") || project.country || "",
      targetAmount: project.fundingTarget?.toString() ?? "0",
      raisedAmount: project.fundingRaised?.toString() ?? "0",
      riskRating: project.riskRating,
      irr: project.returnTarget ? Number(project.returnTarget) : null,
      daysLeft,
      status: item.deal.status,
      createdAt: item.createdAt,
    };
  }

  async remove(dealId: string, user: AuthenticatedUser): Promise<void> {
    const item = await this.prisma.watchlistItem.findUnique({
      where: { userId_dealId: { userId: user.id, dealId } },
    });
    if (!item) throw new NotFoundException("Watchlist item not found");
    await this.prisma.watchlistItem.delete({
      where: { userId_dealId: { userId: user.id, dealId } },
    });
  }
}

@ApiTags("Watchlist")
@ApiBearerAuth()
@Controller("watchlist")
class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Get()
  @ApiOperation({ summary: "List user's watchlisted deals" })
  findByUser(@CurrentUser() user: AuthenticatedUser): Promise<WatchlistItemResponse[]> {
    return this.watchlistService.findByUser(user);
  }

  @Post()
  @ApiOperation({ summary: "Add a deal to watchlist" })
  add(
    @Body() dto: AddToWatchlistDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WatchlistItemResponse> {
    return this.watchlistService.add(dto, user);
  }

  @Delete(":dealId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a deal from watchlist" })
  remove(
    @Param("dealId") dealId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.watchlistService.remove(dealId, user);
  }
}

@Module({
  controllers: [WatchlistController],
  providers: [WatchlistService],
})
export class WatchlistModule {}
