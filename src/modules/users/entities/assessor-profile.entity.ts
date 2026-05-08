import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn
} from 'typeorm';
import { AssessorType, AssessorAvailability } from '@common/enums';
import { User } from './user.entity';

@Entity('assessor_profiles')
export class AssessorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  organizationName: string;

  @Column({ type: 'enum', enum: AssessorType, default: AssessorType.FIRM })
  organizationType: AssessorType;

  @Column({ type: 'varchar', array: true, nullable: true })
  specialties: string[];

  @Column({ type: 'jsonb', nullable: true })
  credentials: Record<string, any>;

  @Column({ type: 'int', default: 0 })
  yearsOfExperience: number;

  @Column({ type: 'int', default: 0 })
  completedEngagements: number;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 0 })
  rating: number;

  @Column({ type: 'enum', enum: AssessorAvailability, default: AssessorAvailability.AVAILABLE })
  availabilityStatus: AssessorAvailability;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate: number;

  @Column({ type: 'varchar', array: true, nullable: true })
  serviceRegions: string[];

  @Column({ type: 'text', nullable: true })
  bio: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.assessorProfile)
  @JoinColumn({ name: 'userId' })
  user: User;
}
