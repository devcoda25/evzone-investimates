import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import {
  DealStatus,
  InvestmentStatus,
  PaymentMethod,
  PlatformRole,
  Prisma,
  ProjectStatus,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";
import {
  AuthenticatedUser,
  CurrentUser,
  getLimit,
  getPage,
  PaginatedResponse,
  PaginationDto,
  Public,
  Roles,
  toPaginationMeta,
} from "@evzone/common";
import { PrismaService, TransactionService } from "@evzone/database";
import { PermissionsService } from "@evzone/permissions";

class DealFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;

  @IsOptional()
  @IsString()
  projectId?: string;
}

class CreateDealDto {
  @IsString()
  projectId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  minInvestment?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  targetAmount?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  opensAt?: string;

  @IsOptional()
  @IsString()
  closesAt?: string;
}

class UpdateDealDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  minInvestment?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  targetAmount?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  opensAt?: string;

  @IsOptional()
  @IsString()
  closesAt?: string;
}

class DealInvestmentDto {
  @Transform(({ value }: { value: string }) => Number(value))
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  currency?: string;
}

interface DealResponse {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  status: DealStatus;
  currency: string;
  minInvestment: string;
  targetAmount: string;
  maxAmount: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
  project: { id: string; title: string; slug: string; status: ProjectStatus };
  investmentCount: number;
  totalCommitted: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(
    dto: CreateDealDto,
    user: AuthenticatedUser,
  ): Promise<DealResponse> {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project || project.deletedAt)
      throw new NotFoundException("Project not found");
    this.permissions.assertTenantAccess(user, project.tenantId);
    if (
      !this.permissions.isPlatformAdmin(user) &&
      project.ownerUserId !== user.id
    ) {
      throw new BadRequestException("You can only create deals for your own projects");
    }
    const deal = await this.prisma.deal.create({
      data: {
        tenantId: project.tenantId,
        projectId: project.id,
        title: dto.title,
        minInvestment: dto.minInvestment ?? Number(project.minInvestment),
        targetAmount: dto.targetAmount ?? Number(project.fundingTarget),
        maxAmount: dto.maxAmount ?? null,
        currency: dto.currency ?? project.currency,
        opensAt: dto.opensAt ? new Date(dto.opensAt) : undefined,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
      },
      include: { project: true, investments: true },
    });
    return this.toResponse(deal);
  }

  async findAll(filter: DealFilterDto): Promise<PaginatedResponse<DealResponse>> {
    const page = getPage(filter);
    const limit = getLimit(filter);
    const where: Prisma.DealWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.projectId) where.projectId = filter.projectId;
    const [data, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include: { project: true, investments: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deal.count({ where }),
    ]);
    return { data: data.map((d) => this.toResponse(d)), meta: toPaginationMeta(page, limit, total) };
  }

  async findOne(id: string): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    return this.toResponse(deal);
  }

  async update(
    id: string,
    dto: UpdateDealDto,
    user: AuthenticatedUser,
  ): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    this.permissions.assertTenantAccess(user, deal.tenantId);
    if (
      !this.permissions.isPlatformAdmin(user) &&
      deal.project.ownerUserId !== user.id
    ) {
      throw new BadRequestException("You can only update your own deals");
    }
    const editableStatuses: DealStatus[] = [DealStatus.DRAFT, DealStatus.COMPLIANCE_REVIEW];
    if (!editableStatuses.includes(deal.status)) {
      throw new BadRequestException("Cannot update a deal that is already live");
    }
    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        title: dto.title,
        minInvestment: dto.minInvestment,
        targetAmount: dto.targetAmount,
        maxAmount: dto.maxAmount,
        currency: dto.currency,
        opensAt: dto.opensAt ? new Date(dto.opensAt) : undefined,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
      },
      include: { project: true, investments: true },
    });
    return this.toResponse(updated);
  }

  async approve(id: string, user: AuthenticatedUser): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.DRAFT && deal.status !== DealStatus.COMPLIANCE_REVIEW) {
      throw new BadRequestException("Deal must be in DRAFT or COMPLIANCE_REVIEW to approve");
    }
    const updated = await this.prisma.deal.update({
      where: { id },
      data: { status: DealStatus.APPROVED },
      include: { project: true, investments: true },
    });
    return this.toResponse(updated);
  }

  async open(id: string, user: AuthenticatedUser): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.APPROVED) {
      throw new BadRequestException("Deal must be APPROVED before opening");
    }
    const updated = await this.prisma.deal.update({
      where: { id },
      data: { status: DealStatus.LIVE, opensAt: new Date() },
      include: { project: true, investments: true },
    });
    return this.toResponse(updated);
  }

  async pause(id: string, user: AuthenticatedUser): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.LIVE) {
      throw new BadRequestException("Only live deals can be paused");
    }
    const updated = await this.prisma.deal.update({
      where: { id },
      data: { status: DealStatus.PAUSED },
      include: { project: true, investments: true },
    });
    return this.toResponse(updated);
  }

  async close(
    id: string,
    successful: boolean,
    user: AuthenticatedUser,
  ): Promise<DealResponse> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { project: true, investments: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    const closableStatuses: DealStatus[] = [DealStatus.LIVE, DealStatus.PAUSED];
    if (!closableStatuses.includes(deal.status)) {
      throw new BadRequestException("Only live or paused deals can be closed");
    }
    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        status: successful
          ? DealStatus.CLOSED_SUCCESSFUL
          : DealStatus.CLOSED_FAILED,
        closesAt: new Date(),
      },
      include: { project: true, investments: true },
    });
    return this.toResponse(updated);
  }

  async invest(
    dealId: string,
    dto: DealInvestmentDto,
    investor: AuthenticatedUser,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const key = idempotencyKey ?? `${investor.id}-${dealId}-${Date.now()}`;
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { project: true },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    if (deal.status !== DealStatus.LIVE) {
      throw new BadRequestException("This deal is not open for investment");
    }
    if (dto.amount < Number(deal.minInvestment)) {
      throw new BadRequestException(
        `Minimum investment for this deal is ${deal.minInvestment.toString()} ${deal.currency}`,
      );
    }
    if (deal.maxAmount) {
      const totalCommitted = await this.prisma.investment.aggregate({
        where: { dealId },
        _sum: { amount: true },
      });
      if (Number(totalCommitted._sum.amount ?? 0) + dto.amount > Number(deal.maxAmount)) {
        throw new BadRequestException("Investment exceeds deal maximum amount");
      }
    }
    const created = await this.transactions.run(async (tx) => {
      const investment = await tx.investment.create({
        data: {
          tenantId: deal.tenantId,
          dealId: deal.id,
          projectId: deal.projectId,
          investorUserId: investor.id,
          amount: dto.amount,
          currency: dto.currency ?? deal.currency,
          status: InvestmentStatus.PENDING_COMPLIANCE,
          idempotencyKey: key,
          paymentMethod: dto.paymentMethod,
        },
        include: { project: true, investor: true },
      });
      await tx.transaction.create({
        data: {
          tenantId: deal.tenantId,
          userId: investor.id,
          investmentId: investment.id,
          projectId: deal.projectId,
          type: TransactionType.INVESTMENT,
          amount: dto.amount,
          currency: dto.currency ?? deal.currency,
          status: TransactionStatus.PENDING,
          paymentMethod: dto.paymentMethod,
          jurisdiction: deal.project.countryCode,
        },
      });
      await tx.project.update({
        where: { id: deal.projectId },
        data: { fundingRaised: { increment: dto.amount } },
      });
      return investment;
    });
    return {
      id: created.id,
      dealId: created.dealId,
      projectId: created.projectId,
      amount: created.amount.toString(),
      currency: created.currency,
      status: created.status,
      paymentMethod: created.paymentMethod,
      idempotencyKey: created.idempotencyKey,
      createdAt: created.createdAt,
    };
  }

  private toResponse(
    deal: Prisma.DealGetPayload<{ include: { project: true; investments: true } }>,
  ): DealResponse {
    const totalCommitted = deal.investments.reduce(
      (sum, inv) => sum + Number(inv.amount),
      0,
    );
    return {
      id: deal.id,
      tenantId: deal.tenantId,
      projectId: deal.projectId,
      title: deal.title,
      status: deal.status,
      currency: deal.currency,
      minInvestment: deal.minInvestment.toString(),
      targetAmount: deal.targetAmount.toString(),
      maxAmount: deal.maxAmount?.toString() ?? null,
      opensAt: deal.opensAt,
      closesAt: deal.closesAt,
      project: {
        id: deal.project.id,
        title: deal.project.title,
        slug: deal.project.slug,
        status: deal.project.status,
      },
      investmentCount: deal.investments.length,
      totalCommitted: totalCommitted.toString(),
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
    };
  }
}

@ApiTags("Deals")
@ApiBearerAuth()
@Controller("deals")
class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Public()
  @Get()
  findAll(
    @Query() filter: DealFilterDto,
  ): Promise<PaginatedResponse<DealResponse>> {
    return this.dealsService.findAll(filter);
  }

  @Public()
  @Get(":id")
  findOne(@Param("id") id: string): Promise<DealResponse> {
    return this.dealsService.findOne(id);
  }

  @Post()
  @Roles(
    PlatformRole.ENTREPRENEUR,
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  create(
    @Body() dto: CreateDealDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.create(dto, user);
  }

  @Patch(":id")
  @Roles(
    PlatformRole.ENTREPRENEUR,
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  )
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDealDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.update(id, dto, user);
  }

  @Post(":id/approve")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  approve(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.approve(id, user);
  }

  @Post(":id/open")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN, PlatformRole.ENTREPRENEUR)
  open(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.open(id, user);
  }

  @Post(":id/pause")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN, PlatformRole.ENTREPRENEUR)
  pause(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.pause(id, user);
  }

  @Post(":id/close")
  @Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
  close(
    @Param("id") id: string,
    @Body("successful") successful: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponse> {
    return this.dealsService.close(id, successful, user);
  }

  @Post(":id/invest")
  @Roles(PlatformRole.INVESTOR)
  invest(
    @Param("id") id: string,
    @Body() dto: DealInvestmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<unknown> {
    return this.dealsService.invest(id, dto, user, idempotencyKey);
  }
}

@Module({
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
