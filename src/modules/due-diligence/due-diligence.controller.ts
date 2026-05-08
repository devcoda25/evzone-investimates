import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { DueDiligenceService } from './due-diligence.service';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums';
import { UnifiedAuthGuard } from '@common/guards/unified-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { User } from '@modules/users/entities/user.entity';
import {
  CreateEngagementDto,
  UpdateEngagementDto,
  SubmitReportDto,
  ReviewReportDto,
  EngagementFilterDto,
  AssessorFilterDto,
} from './dto';

@ApiTags('Due Diligence')
@ApiBearerAuth()
@UseGuards(UnifiedAuthGuard, RolesGuard)
@Controller('due-diligence')
export class DueDiligenceController {
  constructor(private readonly service: DueDiligenceService) {}

  // ==================== ENGAGEMENTS ====================

  @Get('engagements')
  @Roles(UserRole.ASSESSOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List engagements (ASSESSOR sees own, ADMIN sees all)' })
  @ApiResponse({ status: 200, description: 'List of engagements returned' })
  async findEngagements(
    @Query() filter: EngagementFilterDto,
    @CurrentUser() user: User,
  ) {
    return this.service.findEngagements(filter, user.id, user.role);
  }

  @Get('engagements/:id')
  @Roles(UserRole.ASSESSOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get engagement by ID with project details' })
  @ApiResponse({ status: 200, description: 'Engagement details returned' })
  @ApiResponse({ status: 404, description: 'Engagement not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.service.findByIdWithAccess(id, user.id, user.role);
  }

  @Post('engagements')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create engagement (ADMIN assigns assessor to project)' })
  @ApiResponse({ status: 201, description: 'Engagement created' })
  @ApiResponse({ status: 400, description: 'Invalid input or project already has active engagement' })
  @HttpCode(HttpStatus.CREATED)
  async createEngagement(@Body() dto: CreateEngagementDto) {
    return this.service.createEngagement(dto);
  }

  @Patch('engagements/:id')
  @Roles(UserRole.ASSESSOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update engagement status/notes' })
  @ApiResponse({ status: 200, description: 'Engagement updated' })
  async updateEngagement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEngagementDto,
    @CurrentUser() user: User,
  ) {
    return this.service.updateEngagement(id, dto, user.id, user.role);
  }

  @Post('engagements/:id/start')
  @Roles(UserRole.ASSESSOR)
  @ApiOperation({ summary: 'Start engagement (ASSESSOR only)' })
  @ApiResponse({ status: 200, description: 'Engagement started' })
  @HttpCode(HttpStatus.OK)
  async startEngagement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.service.startEngagement(id, user.id);
  }

  @Post('engagements/:id/submit')
  @Roles(UserRole.ASSESSOR)
  @ApiOperation({ summary: 'Submit due diligence report (ASSESSOR only)' })
  @ApiResponse({ status: 200, description: 'Report submitted' })
  @HttpCode(HttpStatus.OK)
  async submitReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReportDto,
    @CurrentUser() user: User,
  ) {
    return this.service.submitReport(id, user.id, dto);
  }

  @Post('engagements/:id/review')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Review submitted report (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Report reviewed' })
  @HttpCode(HttpStatus.OK)
  async reviewReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReportDto,
  ) {
    return this.service.reviewReport(id, dto);
  }

  // ==================== PROJECTS ====================

  @Get('projects')
  @Roles(UserRole.ASSESSOR)
  @ApiOperation({ summary: 'Get available projects for due diligence assessment' })
  @ApiResponse({ status: 200, description: 'List of available projects' })
  async findAvailableProjects() {
    return this.service.findAvailableProjects();
  }

  // ==================== ASSESSORS ====================

  @Get('assessors')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all assessors with profiles (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'List of assessors' })
  async findAssessors(@Query() filter: AssessorFilterDto) {
    return this.service.findAssessors(filter);
  }

  // ==================== STATS ====================

  @Get('stats/overview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get due diligence statistics overview (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Statistics returned' })
  async getStats() {
    return this.service.getStats();
  }
}
