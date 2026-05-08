import { ApiProperty } from '@nestjs/swagger';

export class RoleCountDto {
  @ApiProperty({ example: 'INVESTOR' })
  role: string;

  @ApiProperty({ example: 150 })
  count: number;
}

export class StatusCountDto {
  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: 320 })
  count: number;
}

export class KycStatusCountDto {
  @ApiProperty({ example: 'VERIFIED' })
  kycStatus: string;

  @ApiProperty({ example: 210 })
  count: number;
}

export class UserStatsDto {
  @ApiProperty({ example: 500, description: 'Total number of users' })
  totalUsers: number;

  @ApiProperty({ example: 45, description: 'New users registered this month' })
  newUsersThisMonth: number;

  @ApiProperty({ type: [RoleCountDto], description: 'User count grouped by role' })
  byRole: RoleCountDto[];

  @ApiProperty({ type: [StatusCountDto], description: 'User count grouped by account status' })
  byStatus: StatusCountDto[];

  @ApiProperty({ type: [KycStatusCountDto], description: 'User count grouped by KYC status' })
  byKycStatus: KycStatusCountDto[];
}
