import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('recon_intelligence_reports')
export class ReconIntelligenceReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  @Column({ type: 'varchar', length: 60 })
  source!: string;

  @Column({ name: 'input_provider', type: 'varchar', length: 40, default: 'manual' })
  inputProvider!: string;

  @Column({ name: 'report_datetime', type: 'timestamptz' })
  reportDatetime!: Date;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb', default: {} })
  rawPayload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
