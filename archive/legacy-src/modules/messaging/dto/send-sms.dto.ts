import { IsString, IsOptional, IsEnum, IsPhoneNumber } from 'class-validator';

export class SendSmsDto {
  @IsPhoneNumber()
  to!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsEnum(['global', 'china'])
  region?: 'global' | 'china' = 'global';
}