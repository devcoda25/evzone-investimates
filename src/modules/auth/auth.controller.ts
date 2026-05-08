import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OidcAuthGuard } from '@common/guards/oidc-auth.guard';
import { JwtRefreshGuard } from '@common/guards/jwt-refresh.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { User } from '@modules/users/entities/user.entity';
import {
  LoginDto,
  RegisterDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import {
  TokenResponseDto,
  LogoutResponseDto,
  PasswordResetResponseDto,
  ForgotPasswordResponseDto,
} from './dto/token-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ───────────────────────────────────────────────
  // Local Auth: Register
  // ───────────────────────────────────────────────

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Creates a new user account with email/password and returns access/refresh tokens.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User registered successfully',
    type: TokenResponseDto,
  })
  @ApiConflictResponse({ description: 'Email already in use' })
  @ApiBadRequestResponse({ description: 'Invalid registration data' })
  async register(@Body() dto: RegisterDto): Promise<TokenResponseDto> {
    return this.authService.register(dto);
  }

  // ───────────────────────────────────────────────
  // Local Auth: Login
  // ───────────────────────────────────────────────

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email and password',
    description: 'Authenticates a user and returns access/refresh tokens.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login successful',
    type: TokenResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<TokenResponseDto> {
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent') || 'unknown';
    return this.authService.login(dto, ipAddress, userAgent);
  }

  // ───────────────────────────────────────────────
  // Local Auth: Refresh Token
  // ───────────────────────────────────────────────

  @Post('refresh')
  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Uses a valid refresh token to generate a new access token pair. Rotates the refresh token.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token refreshed successfully',
    type: TokenResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  async refresh(
    @CurrentUser('id') userId: string,
    @CurrentUser('tokenId') tokenId: string,
  ): Promise<TokenResponseDto> {
    return this.authService.refresh(userId, tokenId);
  }

  // ───────────────────────────────────────────────
  // Local Auth: Change Password
  // ───────────────────────────────────────────────

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change password',
    description: 'Changes the user password and revokes all active sessions.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password changed successfully',
    type: PasswordResetResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<PasswordResetResponseDto> {
    await this.authService.changePassword(userId, dto);
    return { message: 'Password changed successfully' };
  }

  // ───────────────────────────────────────────────
  // Local Auth: Forgot Password
  // ───────────────────────────────────────────────

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Generates a password reset token. In development, the token is returned in the response.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Reset request processed',
    type: ForgotPasswordResponseDto,
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponseDto> {
    return this.authService.forgotPassword(dto);
  }

  // ───────────────────────────────────────────────
  // Local Auth: Reset Password
  // ───────────────────────────────────────────────

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password with token',
    description: 'Resets the password using a token received from forgot-password.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password reset successfully',
    type: PasswordResetResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid or expired reset token' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<PasswordResetResponseDto> {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset successfully' };
  }

  // ───────────────────────────────────────────────
  // Logout (works for both OIDC and local)
  // ───────────────────────────────────────────────

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout',
    description: 'Logs out the current user and revokes the refresh token.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logged out successfully',
    type: LogoutResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing access token',
  })
  async logout(
    @CurrentUser('id') userId: string,
    @Body('refreshToken') refreshToken?: string,
  ): Promise<LogoutResponseDto> {
    await this.authService.logout(userId, refreshToken);
    return { message: 'Logged out successfully' };
  }

  // ───────────────────────────────────────────────
  // Logout All Devices
  // ───────────────────────────────────────────────

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout from all devices',
    description: 'Revokes all refresh tokens for the current user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logged out from all devices',
    type: LogoutResponseDto,
  })
  async logoutAll(
    @CurrentUser('id') userId: string,
  ): Promise<LogoutResponseDto> {
    await this.authService.logoutAll(userId);
    return { message: 'Logged out from all devices' };
  }

  // ───────────────────────────────────────────────
  // Get Current User (OIDC or local JWT)
  // ───────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current user',
    description: "Returns the currently authenticated user's profile information.",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing access token',
  })
  @ApiNotFoundResponse({
    description: 'User not found',
  })
  async getMe(@CurrentUser('id') userId: string): Promise<User> {
    return this.authService.getMe(userId);
  }
}
