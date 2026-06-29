import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type OperatorShiftStatus = 'active' | 'completed';

@Entity('operator_shifts')
export class OperatorShift {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'operator_user_id', type: 'uuid' })
  operatorUserId!: string;

  @Column({ name: 'operator_login', type: 'varchar', length: 100 })
  operatorLogin!: string;

  @Column({ name: 'operator_name', type: 'varchar', length: 255, nullable: true })
  operatorName!: string | null;

  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status!: OperatorShiftStatus;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
