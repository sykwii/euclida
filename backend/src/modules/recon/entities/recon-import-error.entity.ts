import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('recon_import_errors')
export class ReconImportError {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId!: string | null;

  @Column({ name: 'row_number', type: 'integer' })
  rowNumber!: number;

  @Column({ name: 'error_code', type: 'varchar', length: 80 })
  errorCode!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ name: 'raw_payload', type: 'jsonb', default: {} })
  rawPayload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
