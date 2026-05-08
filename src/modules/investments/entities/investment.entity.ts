import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn
} from 'typeorm';
import { InvestmentStatus, PaymentMethod } from '@common/enums';
import { User } from '@modules/users/entities/user.entity';
import { Project } from '@modules/projects/entities/project.entity';

@Entity('investments')
export class Investment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  investorId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: InvestmentStatus, default: InvestmentStatus.PENDING })
  status: InvestmentStatus;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  transactionReference: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  equityPercentage: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  expectedReturns: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  actualReturns: number;

  @Column({ type: 'timestamp' })
  investedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'investorId' })
  investor: User;

  @ManyToOne(() => Project, (project) => project.id)
  @JoinColumn({ name: 'projectId' })
  project: Project;
}
