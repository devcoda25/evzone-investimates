import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '@modules/users/entities/user.entity';
import { InvestorProfile } from '@modules/users/entities/investor-profile.entity';
import { EntrepreneurProfile } from '@modules/users/entities/entrepreneur-profile.entity';
import { AssessorProfile } from '@modules/users/entities/assessor-profile.entity';
import { RefreshToken } from '@modules/auth/entities/refresh-token.entity';
import { OidcAuthGuard } from '@common/guards/oidc-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      InvestorProfile,
      EntrepreneurProfile,
      AssessorProfile,
      RefreshToken,
    ]),
    JwtModule.register({}),
  ],
  providers: [
    AuthService,
    OidcAuthGuard,
    JwtStrategy,
    JwtRefreshStrategy,
  ],
  controllers: [AuthController],
  exports: [AuthService, OidcAuthGuard],
})
export class AuthModule {}
