import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '@modules/users/entities/user.entity';
import { Project } from '@modules/projects/entities/project.entity';
import { Investment } from '@modules/investments/entities/investment.entity';
import { Transaction } from '@modules/investments/entities/transaction.entity';
import { DueDiligenceEngagement } from '@modules/due-diligence/entities/due-diligence-engagement.entity';
import { AssessorProfile } from '@modules/users/entities/assessor-profile.entity';

import { ComplianceAlert } from './entities/compliance-alert.entity';
import { Dispute } from './entities/dispute.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceAlert,
      Dispute,
      AuditLog,
      User,
      Project,
      Investment,
      Transaction,
      DueDiligenceEngagement,
      AssessorProfile,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
