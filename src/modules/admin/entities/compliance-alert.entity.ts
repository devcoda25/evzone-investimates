import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn
} from 'typeorm';
import { ComplianceAlertType, ComplianceAlertSeverity, ComplianceAlertStatus } from '@common/enums';

@Entity('compliance_alerts')
export class ComplianceAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ComplianceAlertType })
  type: ComplianceAlertType;

  @Column({ type: 'enum', enum: ComplianceAlertSeverity })
  severity: ComplianceAlertSeverity;

  @Column({ type: 'varchar', length: 50 })
  entityType: string;

  @Column({ type: 'uuid' })
  entityId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: ComplianceAlertStatus, default: ComplianceAlertStatus.OPEN })
  status: ComplianceAlertStatus;

  @Column({ type: 'uuid', nullable: true })
  assignedTo: string;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @Column({ type: 'text', nullable: true })
  resolutionNotes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
