import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn
} from 'typeorm';
import { EntrepreneurStage } from '@common/enums';
import { User } from './user.entity';

@Entity('entrepreneur_profiles')
export class EntrepreneurProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  companyName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  companyRegistration: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  companyWebsite: string;

  @Column({ type: 'varchar', length: 100 })
  industry: string;

  @Column({ type: 'int', nullable: true })
  foundedYear: number;

  @Column({ type: 'int', nullable: true })
  teamSize: number;

  @Column({ type: 'enum', enum: EntrepreneurStage, default: EntrepreneurStage.IDEA })
  stage: EntrepreneurStage;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pitchDeck: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  previousFunding: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalRaised: number;

  @Column({ type: 'int', default: 0 })
  activeCampaigns: number;

  @Column({ type: 'int', default: 0 })
  completedCampaigns: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.entrepreneurProfile)
  @JoinColumn({ name: 'userId' })
  user: User;
}
