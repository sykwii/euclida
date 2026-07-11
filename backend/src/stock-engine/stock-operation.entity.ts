import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('stock_operations')
export class StockOperation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 160,
    unique: true,
  })
  idempotencyKey!: string;

  @Column({ name: 'operation_type', type: 'varchar', length: 30 })
  operationType!: string;

  @Column({ name: 'movement_group_id', type: 'uuid', unique: true })
  movementGroupId!: string;

  @Column({ name: 'from_depot_id', type: 'uuid', nullable: true })
  fromDepotId!: string | null;

  @Column({ name: 'to_depot_id', type: 'uuid', nullable: true })
  toDepotId!: string | null;

  @Column({
    name: 'source_storage_type',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  sourceStorageType!: string | null;

  @Column({
    name: 'source_storage_id',
    type: 'uuid',
    nullable: true,
  })
  sourceStorageId!: string | null;

  @Column({
    name: 'destination_storage_type',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  destinationStorageType!: string | null;

  @Column({
    name: 'destination_storage_id',
    type: 'uuid',
    nullable: true,
  })
  destinationStorageId!: string | null;

  @Column({
    name: 'document_number',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  documentNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;
}
