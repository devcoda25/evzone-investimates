import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  DeleteDateColumn, OneToOne, OneToMany, JoinColumn
} from 'typeorm';
import { UserRole, UserStatus, KycStatus } from '@common/enums';
import { InvestorProfile } from './investor-profile.entity';
import { EntrepreneurProfile } from './entrepreneur-profile.entity';
import { AssessorProfile } from './assessor-profile.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  oidcSub: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  oidcIssuer: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatar: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.INVESTOR })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING_VERIFICATION })
  status: UserStatus;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.NOT_STARTED })
  kycStatus: KycStatus;

  @Column({ type: 'timestamp', nullable: true })
  kycSubmittedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  kycVerifiedAt: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ type: 'int', default: 0 })
  loginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockoutUntil: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  @OneToOne(() => InvestorProfile, (profile) => profile.user, { cascade: true })
  @JoinColumn()
  investorProfile: InvestorProfile;

  @OneToOne(() => EntrepreneurProfile, (profile) => profile.user, { cascade: true })
  @JoinColumn()
  entrepreneurProfile: EntrepreneurProfile;

  @OneToOne(() => AssessorProfile, (profile) => profile.user, { cascade: true })
  @JoinColumn()
  assessorProfile: AssessorProfile;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
