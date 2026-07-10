import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('recon_import_batches')
export class ReconImportBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60, default: 'delta_import' })
  source!: string;

  @Column({ type: 'varchar', length: 40, default: 'preview' })
  status!: string;

  @Column({ name: 'total_rows', type: 'integer', default: 0 })
  totalRows!: number;

  @Column({ name: 'accepted_rows', type: 'integer', default: 0 })
  acceptedRows!: number;

  @Column({ name: 'duplicate_rows', type: 'integer', default: 0 })
  duplicateRows!: number;

  @Column({ name: 'error_rows', type: 'integer', default: 0 })
  errorRows!: number;

  @Column({ name: 'raw_payload', type: 'jsonb', default: {} })
  rawPayload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;
}
