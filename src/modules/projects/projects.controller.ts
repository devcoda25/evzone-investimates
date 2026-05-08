import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { UnifiedAuthGuard } from '@common/guards/unified-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles, UserRole } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { User } from '@modules/users/entities/user.entity';
import {
  CreateProjectDto,
  UpdateProjectDto,
  ProjectFilterDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto';
import { PaginatedResponse } from '@common/dto/pagination.dto';
import { Project } from './entities/project.entity';
import { Milestone } from './entities/milestone.entity';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(UnifiedAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // ───────────────────────────────────────────────
  // List Projects
  // ───────────────────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: 'List projects (public, filtered)' })
  @ApiResponse({ status: 200, description: 'Paginated list of projects' })
  async findAll(
    @Query() filter: ProjectFilterDto,
    @CurrentUser() user?: User,
  ): Promise<PaginatedResponse<Project>> {
    return this.projectsService.findAll(filter, user);
  }

  // ───────────────────────────────────────────────
  // Featured Projects
  // ───────────────────────────────────────────────

  @Get('featured')
  @Public()
  @ApiOperation({ summary: 'Get featured projects' })
  @ApiResponse({ status: 200, description: 'List of featured projects' })
  async findFeatured(): Promise<Project[]> {
    return this.projectsService.findFeatured();
  }

  // ───────────────────────────────────────────────
  // Stats
  // ───────────────────────────────────────────────

  @Get('stats/overview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Project statistics (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Project stats returned' })
  async getStats() {
    return this.projectsService.getStats();
  }

  // ───────────────────────────────────────────────
  // Create Project
  // ───────────────────────────────────────────────

  @Post()
  @Roles(UserRole.ENTREPRENEUR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new project (ENTREPRENEUR only)' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - entrepreneur role required' })
  async create(
    @CurrentUser('id') entrepreneurId: string,
    @Body() dto: CreateProjectDto,
  ): Promise<Project> {
    return this.projectsService.create(entrepreneurId, dto);
  }

  // ───────────────────────────────────────────────
  // Get Project by ID
  // ───────────────────────────────────────────────

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiParam({ name: 'id', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Project returned' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: User,
  ): Promise<Project> {
    return this.projectsService.findOne(id, user);
  }

  // ───────────────────────────────────────────────
  // Get Project Full Details
  // ───────────────────────────────────────────────

  @Get(':id/full')
  @ApiOperation({ summary: 'Get project with all relations (owner/admin)' })
  @ApiParam({ name: 'id', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Full project details returned' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner or admin' })
  async findOneFull(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.findOneFull(id, user);
  }

  // ───────────────────────────────────────────────
  // Update Project
  // ───────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({ summary: 'Update project (owner or admin)' })
  @ApiParam({ name: 'id', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Project updated' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner or admin' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.update(id, dto, user);
  }

  // ───────────────────────────────────────────────
  // Delete Project
  // ───────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete project (owner or admin)' })
  @ApiParam({ name: 'id', description: 'Project UUID' })
  @ApiResponse({ status: 204, description: 'Project deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner or admin' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.projectsService.remove(id, user);
  }

  // ───────────────────────────────────────────────
  // Submit for Review
  // ───────────────────────────────────────────────

  @Post(':id/submit')
  @Roles(UserRole.ENTREPRENEUR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit project for review (owner)' })
  @ApiResponse({ status: 200, description: 'Project submitted for review' })
  async submitForReview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.submitForReview(id, user);
  }

  // ───────────────────────────────────────────────
  // Approve Project
  // ───────────────────────────────────────────────

  @Post(':id/approve')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve project (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Project approved' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.approve(id, user);
  }

  // ───────────────────────────────────────────────
  // Reject Project
  // ───────────────────────────────────────────────

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject project (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Project rejected' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.reject(id, user);
  }

  // ───────────────────────────────────────────────
  // Toggle Featured
  // ───────────────────────────────────────────────

  @Post(':id/feature')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle featured status (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Featured status toggled' })
  async toggleFeatured(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Project> {
    return this.projectsService.toggleFeatured(id, user);
  }

  // ───────────────────────────────────────────────
  // Milestones
  // ───────────────────────────────────────────────

  @Get(':id/milestones')
  @ApiOperation({ summary: 'List project milestones' })
  @ApiResponse({ status: 200, description: 'Milestones returned' })
  async findMilestones(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Milestone[]> {
    return this.projectsService.findMilestones(id, user);
  }

  @Post(':id/milestones')
  @ApiOperation({ summary: 'Create milestone (owner or admin)' })
  @ApiResponse({ status: 201, description: 'Milestone created' })
  async createMilestone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMilestoneDto,
    @CurrentUser() user: User,
  ): Promise<Milestone> {
    return this.projectsService.createMilestone(id, dto, user);
  }
}

@ApiTags('Milestones')
@ApiBearerAuth()
@UseGuards(UnifiedAuthGuard, RolesGuard)
@Controller('milestones')
export class MilestonesController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update milestone (owner or admin)' })
  @ApiResponse({ status: 200, description: 'Milestone updated' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneDto,
    @CurrentUser() user: User,
  ): Promise<Milestone> {
    return this.projectsService.updateMilestone(id, dto, user);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark milestone as complete' })
  @ApiResponse({ status: 200, description: 'Milestone completed' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<Milestone> {
    return this.projectsService.completeMilestone(id, user);
  }
}
