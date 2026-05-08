import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '@modules/users/entities/user.entity';
import { InvestorProfile } from '@modules/users/entities/investor-profile.entity';
import { EntrepreneurProfile } from '@modules/users/entities/entrepreneur-profile.entity';
import { AssessorProfile } from '@modules/users/entities/assessor-profile.entity';
import { OidcAuthGuard } from '@common/guards/oidc-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      InvestorProfile,
      EntrepreneurProfile,
      AssessorProfile,
    ]),
  ],
  providers: [AuthService, OidcAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, OidcAuthGuard],
})
export class AuthModule {}
