import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn
} from 'typeorm';
import { InvestorType, RiskTolerance } from '@common/enums';
import { User } from './user.entity';

@Entity('investor_profiles')
export class InvestorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'enum', enum: InvestorType, default: InvestorType.INDIVIDUAL })
  investorType: InvestorType;

  @Column({ type: 'enum', enum: RiskTolerance, default: RiskTolerance.MODERATE })
  riskTolerance: RiskTolerance;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  annualIncome: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  netWorth: number;

  @Column({ type: 'boolean', default: false })
  accreditationStatus: boolean;

  @Column({ type: 'text', array: true, nullable: true })
  investmentGoals: string[];

  @Column({ type: 'varchar', array: true, nullable: true })
  preferredSectors: string[];

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalInvested: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalReturns: number;

  @Column({ type: 'int', default: 0 })
  activeInvestments: number;

  @Column({ type: 'int', default: 0 })
  completedInvestments: number;

  @Column({ type: 'jsonb', nullable: true })
  esgPreferences: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.investorProfile)
  @JoinColumn({ name: 'userId' })
  user: User;
}
