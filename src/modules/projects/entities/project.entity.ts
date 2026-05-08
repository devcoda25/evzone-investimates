import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  DeleteDateColumn, ManyToOne, JoinColumn, OneToMany
} from 'typeorm';
import { ProjectStatus, ProjectSector, ProjectStage } from '@common/enums';
import { User } from '@modules/users/entities/user.entity';
import { Milestone } from './milestone.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  entrepreneurId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitle: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  longDescription: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  coverImage: string;

  @Column({ type: 'varchar', length: 500, array: true, nullable: true })
  galleryImages: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  videoUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  impactVideo: string;

  @Column({ type: 'jsonb', nullable: true })
  story: { problem: string; solution: string; journey: string; vision: string };

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valuation: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  structure: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  returnTarget: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  coordinates: string;

  @Column({ type: 'text', nullable: true })
  locationDescription: string;

  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.DRAFT })
  status: ProjectStatus;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  fundingGoal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  fundingRaised: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 100 })
  minInvestment: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  maxInvestment: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  equityOffered: number;

  @Column({ type: 'varchar', length: 100 })
  country: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string;

  @Column({ type: 'enum', enum: ProjectSector })
  sector: ProjectSector;

  @Column({ type: 'enum', enum: ProjectStage })
  stage: ProjectStage;

  @Column({ type: 'jsonb', nullable: true })
  impactMetrics: Record<string, any>;

  @Column({ type: 'int', array: true, nullable: true })
  sdgs: number[];

  @Column({ type: 'timestamp', nullable: true })
  campaignStartDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  campaignEndDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  projectStartDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  projectEndDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  teamMembers: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  risks: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  faqs: Record<string, any>;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @Column({ type: 'boolean', default: false })
  featured: boolean;

  @Column({ type: 'int', nullable: true })
  featuredOrder: number;

  @Column({ type: 'varchar', length: 50, default: 'NOT_STARTED' })
  dueDiligenceStatus: string;

  @Column({ type: 'int', nullable: true })
  dueDiligenceScore: number;

  @Column({ type: 'uuid', nullable: true })
  assessorAssignedId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'entrepreneurId' })
  entrepreneur: User;

  @OneToMany(() => Milestone, (milestone) => milestone.project, { cascade: true })
  milestones: Milestone[];

  get fundingProgress(): number {
    if (!this.fundingGoal) return 0;
    return Math.min(Math.round((this.fundingRaised / this.fundingGoal) * 100), 100);
  }
}
