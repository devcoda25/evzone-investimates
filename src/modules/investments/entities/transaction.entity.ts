import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn
} from 'typeorm';
import { TransactionType, TransactionStatus, PaymentMethod } from '@common/enums';
import { User } from '@modules/users/entities/user.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  investmentId: string;

  @Column({ type: 'uuid', nullable: true })
  projectId: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', length: 50, nullable: true })
  paymentProvider: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerTransactionId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fromParty: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  toParty: string;

  @Column({ type: 'int', nullable: true })
  riskScore: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  jurisdiction: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'userId' })
  user: User;
}
