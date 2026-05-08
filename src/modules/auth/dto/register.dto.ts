import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@common/enums';

@ValidatorConstraint({ name: 'passwordStrength', async: false })
class PasswordStrengthConstraint implements ValidatorConstraintInterface {
  validate(password: string): boolean {
    if (!password || password.length < 8) return false;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    return hasUppercase && hasLowercase && hasNumber && hasSpecialChar;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must contain at least one uppercase letter, one lowercase letter, one number, and one special character`;
  }
}

export class RegisterDto {
  @ApiProperty({ description: 'User email address', example: 'john.doe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'MyStr0ng!Pass',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Validate(PasswordStrengthConstraint)
  password: string;

  @ApiProperty({ description: 'First name', example: 'John', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(100, { message: 'First name must not exceed 100 characters' })
  firstName: string;

  @ApiProperty({ description: 'Last name', example: 'Doe', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(100, { message: 'Last name must not exceed 100 characters' })
  lastName: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.INVESTOR,
    enumName: 'UserRole',
  })
  @IsEnum(UserRole, { message: 'Role must be one of: INVESTOR, ENTREPRENEUR, ASSESSOR' })
  role: UserRole;

  @ApiPropertyOptional({ description: 'Country of residence', example: 'United States' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+1-555-123-4567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[+]?[\d\s\-()]+$/, { message: 'Please provide a valid phone number' })
  phone?: string;
}
