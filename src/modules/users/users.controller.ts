import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
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
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { OidcAuthGuard } from '@common/guards/oidc-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { OwnerOrAdminGuard } from '@common/guards/owner-or-admin.guard';
import { Roles, UserRole } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { UserFilterDto } from './dto/user-filter.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { KycSubmitDto } from './dto/kyc-submit.dto';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { UserStatsDto } from './dto/user-stats.dto';
import { PaginatedResponse } from '@common/dto/pagination.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(OidcAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ───────────────────────────────────────────────
  // ADMIN: List all users (paginated, filterable)
  // ───────────────────────────────────────────────
  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all users (ADMIN only)', description: 'Returns a paginated, filterable list of all users.' })
  @ApiResponse({ status: 200, description: 'List of users returned successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin access required.' })
  async findAll(@Query() filter: UserFilterDto): Promise<PaginatedResponse<User>> {
    return this.usersService.findAll(filter);
  }

  // ───────────────────────────────────────────────
  // ADMIN: Get user statistics overview
  // ───────────────────────────────────────────────
  @Get('stats/overview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'User statistics overview (ADMIN only)', description: 'Returns aggregated user statistics by role, status, and KYC status.' })
  @ApiResponse({ status: 200, description: 'Statistics returned successfully.', type: UserStatsDto })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin access required.' })
  async getStats(): Promise<UserStatsDto> {
    return this.usersService.getStats();
  }

  // ───────────────────────────────────────────────
  // ADMIN / Own user: Get user by ID
  // ───────────────────────────────────────────────
  @Get(':id')
  @UseGuards(OwnerOrAdminGuard)
  @ApiOperation({ summary: 'Get user by ID', description: 'Returns a single user with their profile. Accessible by ADMIN or the user themselves.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'User returned successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Not owner or admin.' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  // ───────────────────────────────────────────────
  // ADMIN / Own user: Update user
  // ───────────────────────────────────────────────
  @Patch(':id')
  @UseGuards(OwnerOrAdminGuard)
  @ApiOperation({ summary: 'Update user', description: 'Update user fields. Accessible by ADMIN or the user themselves.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'User updated successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'Email conflict.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(id, dto);
  }

  // ───────────────────────────────────────────────
  // ADMIN: Soft delete user
  // ───────────────────────────────────────────────
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete user (ADMIN only)', description: 'Soft-deletes a user account. The record is retained but marked as deleted.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 204, description: 'User deleted successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin access required.' })
  async softDelete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.usersService.softDelete(id);
  }

  // ───────────────────────────────────────────────
  // ADMIN: Verify user KYC
  // ───────────────────────────────────────────────
  @Post(':id/verify')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Verify user KYC (ADMIN only)', description: 'Approve or reject a user\'s KYC submission.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'KYC status updated successfully.' })
  @ApiResponse({ status: 400, description: 'User has no pending KYC submission.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin access required.' })
  async verifyKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyKycDto,
  ): Promise<User> {
    return this.usersService.verifyKyc(id, dto);
  }

  // ───────────────────────────────────────────────
  // ADMIN: Suspend user
  // ───────────────────────────────────────────────
  @Post(':id/suspend')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Suspend user (ADMIN only)', description: 'Suspends a user account, preventing login and access.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'User suspended successfully.' })
  @ApiResponse({ status: 400, description: 'User is already suspended.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin access required.' })
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ): Promise<User> {
    return this.usersService.suspend(id, reason);
  }

  // ───────────────────────────────────────────────
  // ADMIN: Unsuspend user
  // ───────────────────────────────────────────────
  @Post(':id/unsuspend')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Unsuspend user (ADMIN only)', description: 'Reactivates a suspended user account.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'User unsuspended successfully.' })
  @ApiResponse({ status: 400, description: 'User is not suspended.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admin access required.' })
  async unsuspend(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.unsuspend(id);
  }

  // ───────────────────────────────────────────────
  // ADMIN / Own user: Get full profile
  // ───────────────────────────────────────────────
  @Get(':id/profile')
  @UseGuards(OwnerOrAdminGuard)
  @ApiOperation({ summary: 'Get user profile', description: 'Returns a user with their role-specific profile loaded. Accessible by ADMIN or the user themselves.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Profile returned successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getProfile(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  // ───────────────────────────────────────────────
  // Own user: Update profile
  // ───────────────────────────────────────────────
  @Patch(':id/profile')
  @UseGuards(OwnerOrAdminGuard)
  @ApiOperation({ summary: 'Update user profile', description: 'Update profile fields: firstName, lastName, phone, bio, country, city, preferences, avatar.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<User> {
    return this.usersService.updateProfile(id, dto);
  }

  // ───────────────────────────────────────────────
  // Own user: Submit KYC
  // ───────────────────────────────────────────────
  @Post(':id/kyc')
  @UseGuards(OwnerOrAdminGuard)
  @ApiOperation({ summary: 'Submit KYC documents', description: 'Submit KYC documents for verification. Sets KYC status to PENDING.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'KYC submitted successfully.' })
  @ApiResponse({ status: 400, description: 'User is already KYC verified.' })
  async submitKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KycSubmitDto,
  ): Promise<User> {
    return this.usersService.submitKyc(id, dto);
  }

  // ───────────────────────────────────────────────
  // ADMIN / Own user: Get KYC status
  // ───────────────────────────────────────────────
  @Get(':id/kyc')
  @UseGuards(OwnerOrAdminGuard)
  @ApiOperation({ summary: 'Get KYC status', description: 'Returns the current KYC status and related metadata for a user.' })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'KYC status returned successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getKycStatus(@Param('id', ParseUUIDPipe) id: string): Promise<{
    kycStatus: string;
    kycSubmittedAt: Date | null;
    kycVerifiedAt: Date | null;
    documents: any;
  }> {
    const user = await this.usersService.findById(id);
    return {
      kycStatus: user.kycStatus,
      kycSubmittedAt: user.kycSubmittedAt,
      kycVerifiedAt: user.kycVerifiedAt,
      documents: user.preferences?.kycDocuments || null,
    };
  }
}
