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
import { IsOptional, IsString } from "class-validator";
import { AuthenticatedUser, CurrentUser } from "@evzone/common";
import { PrismaService } from "@evzone/database";

class ChatMessageDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

interface ChatMessageResponse {
  id: string;
  role: "user" | "ai";
  text: string;
  createdAt: Date;
}

interface ChatSessionResponse {
  id: string;
  title: string | null;
  messages: ChatMessageResponse[];
  createdAt: Date;
  updatedAt: Date;
}

interface InsightResponse {
  id: string;
  type: "opportunity" | "warning" | "insight";
  title: string;
  description: string;
  confidence: number;
  actionLabel: string;
}

@Injectable()
class AiAdvisorService {
  constructor(private readonly prisma: PrismaService) {}

  async getSessions(user: AuthenticatedUser): Promise<Pick<ChatSessionResponse, "id" | "title" | "createdAt" | "updatedAt">[]> {
    const sessions = await this.prisma.aiChatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async getSession(sessionId: string, user: AuthenticatedUser): Promise<ChatSessionResponse> {
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!session) throw new NotFoundException("Session not found");
    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "ai",
        text: m.text,
        createdAt: m.createdAt,
      })),
    };
  }

  async sendMessage(
    dto: ChatMessageDto,
    user: AuthenticatedUser,
  ): Promise<{ userMessage: ChatMessageResponse; aiMessage: ChatMessageResponse; sessionId: string }> {
    let sessionId = dto.sessionId;

    if (!sessionId) {
      const session = await this.prisma.aiChatSession.create({
        data: {
          userId: user.id,
          title: dto.text.slice(0, 50),
        },
      });
      sessionId = session.id;
    } else {
      const existing = await this.prisma.aiChatSession.findFirst({
        where: { id: sessionId, userId: user.id },
      });
      if (!existing) throw new NotFoundException("Session not found");
    }

    const userMsg = await this.prisma.aiChatMessage.create({
      data: {
        sessionId,
        role: "user",
        text: dto.text,
      },
    });

    const aiResponse = this.generateMockResponse(dto.text);

    const aiMsg = await this.prisma.aiChatMessage.create({
      data: {
        sessionId,
        role: "ai",
        text: aiResponse,
      },
    });

    await this.prisma.aiChatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return {
      sessionId,
      userMessage: {
        id: userMsg.id,
        role: "user",
        text: userMsg.text,
        createdAt: userMsg.createdAt,
      },
      aiMessage: {
        id: aiMsg.id,
        role: "ai",
        text: aiMsg.text,
        createdAt: aiMsg.createdAt,
      },
    };
  }

  async getInsights(_user: AuthenticatedUser): Promise<InsightResponse[]> {
    // In a real implementation, this would analyze the user's portfolio
    return [
      {
        id: "i1",
        type: "opportunity",
        title: "Your portfolio is overweight in Solar (45%). Consider diversifying into Wind or Hydro.",
        description: "Solar concentration increases sector-specific risk. Wind projects offer comparable IRR (14-16%) with lower correlation to solar irradiance factors.",
        confidence: 92,
        actionLabel: "View Sector Analysis",
      },
      {
        id: "i2",
        type: "warning",
        title: "3 of your investments are approaching distribution dates in Q2.",
        description: "Expected distributions totaling $47,500 from Kilifi Solar, Atlas Wind, and Blue Nile Hydro. Consider reinvestment strategies.",
        confidence: 88,
        actionLabel: "View Calendar",
      },
      {
        id: "i3",
        type: "insight",
        title: "Tax-loss harvesting opportunity could save ~$4,200 this year.",
        description: "Two underperforming positions in Biogas could be strategically harvested against gains before fiscal year-end.",
        confidence: 85,
        actionLabel: "Learn More",
      },
      {
        id: "i4",
        type: "opportunity",
        title: "EV Infrastructure sector showing 22% average IRR vs. 14% portfolio average.",
        description: "Consider increasing allocation. Lagos EV Charging and Accra Smart Grid are strong candidates.",
        confidence: 79,
        actionLabel: "Browse EV Deals",
      },
    ];
  }

  private generateMockResponse(userText: string): string {
    const lower = userText.toLowerCase();
    if (lower.includes("optimize") || lower.includes("portfolio")) {
      return "Based on your current portfolio, I recommend reducing Solar allocation by $125K and increasing Wind by $75K. This would decrease sector risk by 2.3% while maintaining a similar expected return. Would you like me to run a detailed simulation?";
    }
    if (lower.includes("risk")) {
      return "Your portfolio has a medium-high risk profile (B+). The main risk factors are: 1) Geographic concentration in East Africa (65%), 2) Currency exposure to KES and NGN, 3) Construction risk in 3 projects. I recommend adding hedged positions or revenue-share structures to balance this.";
    }
    if (lower.includes("impact") || lower.includes("esg")) {
      return "Your investments are projected to avoid 1,240 tons of CO₂ and generate 3,850 MWh of clean energy annually. This places you in the top 15% of EVzone investors by impact score. Your strongest impact contribution comes from Kilifi Solar Farm.";
    }
    if (lower.includes("rebalance")) {
      return "Here are my rebalancing recommendations:\n\n1. Reduce Kilifi Solar by $125K (overweight at 45%)\n2. Increase Atlas Wind by $75K (strong ESG, lower correlation)\n3. New position: Lagos EV Charging — $50K (22% projected IRR)\n4. Hold Blue Nile Hydro (18% IRR justifies regulatory risk)\n\nExpected result: +0.8% portfolio IRR, -2.3% sector risk.";
    }
    return "I'm here to help with portfolio analysis, deal evaluation, risk assessment, and impact projections. Could you provide more details about what you'd like to explore?";
  }
}

@ApiTags("AI Advisor")
@ApiBearerAuth()
@Controller("ai-advisor")
class AiAdvisorController {
  constructor(private readonly aiAdvisorService: AiAdvisorService) {}

  @Get("sessions")
  @ApiOperation({ summary: "List chat sessions for current user" })
  getSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.aiAdvisorService.getSessions(user);
  }

  @Get("sessions/:id")
  @ApiOperation({ summary: "Get a specific chat session with messages" })
  getSession(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChatSessionResponse> {
    return this.aiAdvisorService.getSession(id, user);
  }

  @Post("chat")
  @ApiOperation({ summary: "Send a message to the AI advisor" })
  sendMessage(
    @Body() dto: ChatMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.aiAdvisorService.sendMessage(dto, user);
  }

  @Get("insights")
  @ApiOperation({ summary: "Get AI-generated portfolio insights" })
  getInsights(@CurrentUser() user: AuthenticatedUser): Promise<InsightResponse[]> {
    return this.aiAdvisorService.getInsights(user);
  }
}

@Module({
  controllers: [AiAdvisorController],
  providers: [AiAdvisorService],
})
export class AiAdvisorModule {}
