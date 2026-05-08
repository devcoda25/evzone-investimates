import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestmentsService } from './investments.service';
import { InvestmentsController, TransactionsController } from './investments.controller';
import { Investment } from './entities/investment.entity';
import { Transaction } from './entities/transaction.entity';
import { Project } from '@modules/projects/entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Investment, Transaction, Project]),
  ],
  controllers: [InvestmentsController, TransactionsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
