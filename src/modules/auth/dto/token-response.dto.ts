import { ApiProperty } from '@nestjs/swagger';

class UserResponseDto {
  @ApiProperty({ description: 'User ID', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id: string;

  @ApiProperty({ description: 'User email', example: 'john.doe@example.com' })
  email: string;

  @ApiProperty({ description: 'First name', example: 'John' })
  firstName: string;

  @ApiProperty({ description: 'Last name', example: 'Doe' })
  lastName: string;

  @ApiProperty({ description: 'Full name', example: 'John Doe' })
  fullName: string;

  @ApiProperty({ description: 'User role', example: 'INVESTOR' })
  role: string;

  @ApiProperty({ description: 'User status', example: 'ACTIVE' })
  status: string;

  @ApiProperty({ description: 'KYC status', example: 'NOT_STARTED' })
  kycStatus: string;

  @ApiProperty({ description: 'Avatar URL', example: 'https://example.com/avatar.jpg', nullable: true })
  avatar: string | null;

  @ApiProperty({ description: 'Country', example: 'United States', nullable: true })
  country: string | null;

  @ApiProperty({ description: 'Phone number', example: '+1-555-123-4567', nullable: true })
  phone: string | null;

  @ApiProperty({ description: 'Account creation date', example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;
}

export class TokenResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Access token expiration time in seconds',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({ description: 'Authenticated user information' })
  user: UserResponseDto;
}

export class LogoutResponseDto {
  @ApiProperty({ description: 'Success message', example: 'Logged out successfully' })
  message: string;
}

export class PasswordResetResponseDto {
  @ApiProperty({ description: 'Success message', example: 'Password reset successfully' })
  message: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({
    description: 'Response message',
    example: 'If the email exists, a password reset link has been sent',
  })
  message: string;
}
