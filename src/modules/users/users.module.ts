import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { InvestorProfile } from './entities/investor-profile.entity';
import { EntrepreneurProfile } from './entities/entrepreneur-profile.entity';
import { AssessorProfile } from './entities/assessor-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      InvestorProfile,
      EntrepreneurProfile,
      AssessorProfile,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
