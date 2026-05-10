import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { AuthenticatedUser, CurrentUser } from "@evzone/common";
import { PrismaService } from "@evzone/database";

class CastVoteDto {
  @IsEnum(["for", "against", "abstain"])
  choice!: "for" | "against" | "abstain";
}

interface VoteResponse {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  status: string;
  deadline: Date;
  quorum: number;
  votes: {
    for: number;
    against: number;
    abstain: number;
  };
  totalVotes: number;
  userVoted?: "for" | "against" | "abstain";
  createdAt: Date;
}

@Injectable()
class VotesService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(user: AuthenticatedUser): Promise<VoteResponse[]> {
    // Find votes for projects the user has invested in
    const investments = await this.prisma.investment.findMany({
      where: { investorUserId: user.id },
      select: { projectId: true },
      distinct: ["projectId"],
    });
    const projectIds = investments.map((i) => i.projectId);
    if (projectIds.length === 0) return [];

    const votes = await this.prisma.governanceVote.findMany({
      where: { projectId: { in: projectIds } },
      include: {
        casts: { where: { userId: user.id } },
        _count: { select: { casts: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return Promise.all(
      votes.map(async (vote) => {
        const project = await this.prisma.project.findUnique({
          where: { id: vote.projectId },
          select: { title: true },
        });

        const forCount = await this.prisma.governanceVoteCast.count({
          where: { voteId: vote.id, choice: "for" },
        });
        const againstCount = await this.prisma.governanceVoteCast.count({
          where: { voteId: vote.id, choice: "against" },
        });
        const abstainCount = await this.prisma.governanceVoteCast.count({
          where: { voteId: vote.id, choice: "abstain" },
        });

        return {
          id: vote.id,
          projectId: vote.projectId,
          projectName: project?.title ?? "Unknown Project",
          title: vote.title,
          description: vote.description,
          status: vote.status,
          deadline: vote.deadline,
          quorum: vote.quorum,
          votes: {
            for: forCount,
            against: againstCount,
            abstain: abstainCount,
          },
          totalVotes: vote._count.casts,
          userVoted: vote.casts[0]?.choice as "for" | "against" | "abstain" | undefined,
          createdAt: vote.createdAt,
        };
      }),
    );
  }

  async castVote(
    voteId: string,
    dto: CastVoteDto,
    user: AuthenticatedUser,
  ): Promise<VoteResponse> {
    const vote = await this.prisma.governanceVote.findUnique({
      where: { id: voteId },
    });
    if (!vote) throw new NotFoundException("Vote not found");
    if (vote.status !== "open") throw new NotFoundException("Vote is closed");
    if (new Date() > vote.deadline) throw new NotFoundException("Vote deadline has passed");

    // Verify user has invested in the project
    const investment = await this.prisma.investment.findFirst({
      where: { investorUserId: user.id, projectId: vote.projectId },
    });
    if (!investment) throw new NotFoundException("You must be an investor to vote");

    await this.prisma.governanceVoteCast.upsert({
      where: {
        voteId_userId: { voteId, userId: user.id },
      },
      create: {
        voteId,
        userId: user.id,
        choice: dto.choice,
      },
      update: {
        choice: dto.choice,
      },
    });

    const project = await this.prisma.project.findUnique({
      where: { id: vote.projectId },
      select: { title: true },
    });

    const forCount = await this.prisma.governanceVoteCast.count({
      where: { voteId, choice: "for" },
    });
    const againstCount = await this.prisma.governanceVoteCast.count({
      where: { voteId, choice: "against" },
    });
    const abstainCount = await this.prisma.governanceVoteCast.count({
      where: { voteId, choice: "abstain" },
    });
    const totalVotes = await this.prisma.governanceVoteCast.count({
      where: { voteId },
    });

    return {
      id: vote.id,
      projectId: vote.projectId,
      projectName: project?.title ?? "Unknown Project",
      title: vote.title,
      description: vote.description,
      status: vote.status,
      deadline: vote.deadline,
      quorum: vote.quorum,
      votes: {
        for: forCount,
        against: againstCount,
        abstain: abstainCount,
      },
      totalVotes,
      userVoted: dto.choice,
      createdAt: vote.createdAt,
    };
  }
}

@ApiTags("Governance Votes")
@ApiBearerAuth()
@Controller("votes")
class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Get()
  @ApiOperation({ summary: "List governance votes for user's invested projects" })
  findForUser(@CurrentUser() user: AuthenticatedUser): Promise<VoteResponse[]> {
    return this.votesService.findForUser(user);
  }

  @Post(":id/cast")
  @ApiOperation({ summary: "Cast a vote on a governance proposal" })
  castVote(
    @Param("id") id: string,
    @Body() dto: CastVoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VoteResponse> {
    return this.votesService.castVote(id, dto, user);
  }
}

@Module({
  controllers: [VotesController],
  providers: [VotesService],
})
export class VotesModule {}
