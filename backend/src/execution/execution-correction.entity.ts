import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('execution_corrections')
export class ExecutionCorrection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_order_id', type: 'uuid' })
  serviceOrderId!: string;

  @Column({ name: 'original_record_id', type: 'uuid' })
  originalRecordId!: string;

  @Column({ name: 'replacement_record_id', type: 'uuid', nullable: true })
  replacementRecordId!: string | null;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
