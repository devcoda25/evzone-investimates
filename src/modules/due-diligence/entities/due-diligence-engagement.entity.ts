import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn
} from 'typeorm';
import { DueDiligenceStatus } from '@common/enums';
import { User } from '@modules/users/entities/user.entity';
import { Project } from '@modules/projects/entities/project.entity';

@Entity('due_diligence_engagements')
export class DueDiligenceEngagement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid', name: 'providerId' })
  assessorId: string;

  @Column({ type: 'enum', enum: DueDiligenceStatus, default: DueDiligenceStatus.ASSIGNED })
  status: DueDiligenceStatus;

  @Column({ type: 'jsonb', nullable: true })
  financialAssessment: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  technicalAssessment: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  legalAssessment: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  esgAssessment: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  marketAssessment: Record<string, any>;

  @Column({ type: 'int', nullable: true })
  overallScore: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  riskLevel: string;

  @Column({ type: 'timestamp' })
  assignedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date;

  @Column({ type: 'timestamp' })
  dueDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  reportDocuments: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, (project) => project.id)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'providerId' })
  assessor: User;
}
