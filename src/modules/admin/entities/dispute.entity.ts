import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn
} from 'typeorm';
import { DisputeType, DisputeStatus } from '@common/enums';
import { User } from '@modules/users/entities/user.entity';

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  initiatorId: string;

  @Column({ type: 'uuid', nullable: true })
  respondentId: string;

  @Column({ type: 'uuid', nullable: true })
  projectId: string;

  @Column({ type: 'uuid', nullable: true })
  investmentId: string;

  @Column({ type: 'enum', enum: DisputeType })
  type: DisputeType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  evidence: Record<string, any>;

  @Column({ type: 'enum', enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  priority: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  financialImpact: number;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'initiatorId' })
  initiator: User;
}
