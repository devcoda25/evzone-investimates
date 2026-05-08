import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum IdType {
  PASSPORT = 'PASSPORT',
  NATIONAL_ID = 'NATIONAL_ID',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  RESIDENCE_PERMIT = 'RESIDENCE_PERMIT',
}

export class KycDocumentDto {
  @ApiProperty({ example: 'passport_front' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'https://storage.example.com/docs/passport_front.pdf' })
  @IsString()
  url: string;
}

export class KycSubmitDto {
  @ApiProperty({
    enum: IdType,
    example: IdType.PASSPORT,
    description: 'Type of identification document submitted',
  })
  @IsEnum(IdType)
  idType: IdType;

  @ApiProperty({ example: 'A123456789' })
  @IsString()
  idNumber: string;

  @ApiProperty({
    type: [KycDocumentDto],
    example: [
      { type: 'passport_front', url: 'https://storage.example.com/docs/pp_front.pdf' },
      { type: 'passport_back', url: 'https://storage.example.com/docs/pp_back.pdf' },
    ],
    description: 'Array of KYC document objects with type and url',
  })
  @IsArray()
  documents: KycDocumentDto[];

  @ApiPropertyOptional({ example: 'Additional notes about the submission' })
  @IsOptional()
  @IsString()
  notes?: string;
}
