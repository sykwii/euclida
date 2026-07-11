import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { ExecutionRecordArtillery } from './execution-record-artillery.entity';

const numericTransformer: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value),
};

export type ExecutionType =
  | 'artillery'
  | 'mortar'
  | 'mlrs'
  | 'fpv'
  | 'bomber'
  | 'other';
export type ExecutionPurpose =
  | 'main'
  | 'adjustment'
  | 'warmup'
  | 'calibration'
  | 'test'
  | 'other';
export type ExecutionResult = 'executed' | 'misfire' | 'aborted' | 'cancelled';
export type ExecutionRecordStatus = 'draft' | 'posted' | 'reversed';

@Entity('execution_records')
export class ExecutionRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_order_id', type: 'uuid' })
  serviceOrderId!: string;

  @ManyToOne(() => ServiceOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder!: ServiceOrder;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 120, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'execution_type', type: 'varchar', length: 30 })
  executionType!: ExecutionType;

  @Column({ type: 'varchar', length: 30 })
  purpose!: ExecutionPurpose;

  @Column({ type: 'varchar', length: 30 })
  result!: ExecutionResult;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'executor_type', type: 'varchar', length: 50, nullable: true })
  executorType!: string | null;

  @Column({ name: 'executor_id', type: 'uuid', nullable: true })
  executorId!: string | null;

  @Column({ name: 'executor_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
  executorSnapshot!: Record<string, unknown>;

  @Column({ type: 'numeric', precision: 18, scale: 3, transformer: numericTransformer })
  quantity!: number;

  @Column({ name: 'resource_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
  resourceSnapshot!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: ExecutionRecordStatus;

  @Column({ name: 'stock_operation_id', type: 'uuid', nullable: true })
  stockOperationId!: string | null;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt!: Date | null;

  @Column({ name: 'posted_by_user_id', type: 'uuid', nullable: true })
  postedByUserId!: string | null;

  @Column({ name: 'reversal_of_record_id', type: 'uuid', nullable: true })
  reversalOfRecordId!: string | null;

  @ManyToOne(() => ExecutionRecord, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reversal_of_record_id' })
  reversalOfRecord!: ExecutionRecord | null;

  @OneToOne(() => ExecutionRecordArtillery, (item) => item.executionRecord)
  artillery!: ExecutionRecordArtillery | null;
}
