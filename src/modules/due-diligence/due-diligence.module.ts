import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DueDiligenceService } from './due-diligence.service';
import { DueDiligenceController } from './due-diligence.controller';
import { DueDiligenceEngagement } from './entities/due-diligence-engagement.entity';
import { Project } from '@modules/projects/entities/project.entity';
import { User } from '@modules/users/entities/user.entity';
import { AssessorProfile } from '@modules/users/entities/assessor-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DueDiligenceEngagement,
      Project,
      User,
      AssessorProfile,
    ]),
  ],
  controllers: [DueDiligenceController],
  providers: [DueDiligenceService],
  exports: [DueDiligenceService],
})
export class DueDiligenceModule {}
