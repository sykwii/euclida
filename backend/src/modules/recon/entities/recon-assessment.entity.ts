import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('recon_assessments')
export class ReconAssessment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId!: string | null;

  @Column({ name: 'proposed_by', type: 'varchar', length: 160, nullable: true })
  proposedBy!: string | null;

  @Column({ name: 'confirmed_by', type: 'varchar', length: 160, nullable: true })
  confirmedBy!: string | null;

  @Column({ type: 'varchar', length: 40, default: 'proposed' })
  status!: string;

  @Column({ name: 'assessment_type', type: 'varchar', length: 80, default: 'no_assessment' })
  assessmentType!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
