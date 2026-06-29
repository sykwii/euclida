import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import { Charge } from '../charges/charge.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { Shell } from '../shells/shell.entity';
import { Zone } from '../zones/zone.entity';

const integerNumericTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) =>
    value === null || value === undefined ? null : Math.trunc(Number(value)),
};

@Entity('service_orders')
export class ServiceOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_number' })
  orderNumber!: string;

  @Column()
  status!: string;

  @Column({ name: 'target_lat', type: 'double precision' })
  targetLat!: number;

  @Column({ name: 'target_lng', type: 'double precision' })
  targetLng!: number;

  @Column({ name: 'target_mgrs', type: 'varchar', length: 64, nullable: true })
  targetMgrs!: string | null;

  @Column({ name: 'target_settlement', type: 'varchar', length: 255, nullable: true })
  targetSettlement!: string | null;

  @Column({ name: 'task_type' })
  taskType!: string;

  @Column({ name: 'planned_resource_a_id', type: 'uuid', nullable: true })
  plannedResourceAId!: string | null;

  @Column({ name: 'planned_resource_b_id', type: 'uuid', nullable: true })
  plannedResourceBId!: string | null;

  @Column({
    name: 'planned_quantity',
    type: 'numeric',
    default: 0,
    transformer: integerNumericTransformer,
  })
  plannedQuantity!: number;

  @Column({
    name: 'actual_quantity',
    type: 'numeric',
    nullable: true,
    transformer: integerNumericTransformer,
  })
  actualQuantity!: number | null;

  @Column({ name: 'selected_fire_position_id', type: 'uuid', nullable: true })
  selectedFirePositionId!: string | null;

  @Column({ name: 'selected_shell_id', type: 'uuid', nullable: true })
  selectedShellId!: string | null;

  @Column({ name: 'selected_charge_id', type: 'uuid', nullable: true })
  selectedChargeId!: string | null;

  @Column({ name: 'selected_zone_id', type: 'uuid', nullable: true })
  selectedZoneId!: string | null;

  @ManyToOne(() => FirePosition, { nullable: true })
  @JoinColumn({ name: 'selected_fire_position_id' })
  selectedFirePosition!: FirePosition | null;

  @ManyToOne(() => Shell, { nullable: true })
  @JoinColumn({ name: 'selected_shell_id' })
  selectedShell!: Shell | null;

  @ManyToOne(() => Charge, { nullable: true })
  @JoinColumn({ name: 'selected_charge_id' })
  selectedCharge!: Charge | null;

  @ManyToOne(() => Zone, { nullable: true })
  @JoinColumn({ name: 'selected_zone_id' })
  selectedZone!: Zone | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'rejected_by_unit_name', type: 'varchar', length: 255, nullable: true })
  rejectedByUnitName!: string | null;

  @Column({ name: 'rejected_at', type: 'timestamp', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'result_type', type: 'varchar', length: 100, nullable: true })
  resultType!: string | null;

  @Column({ name: 'result_comment', type: 'text', nullable: true })
  resultComment!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

@Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
createdByUserId!: string | null;

@Column({ name: 'assigned_unit_id', type: 'uuid', nullable: true })
assignedUnitId!: string | null;

@Column({ name: 'assigned_scope', type: 'varchar', length: 50, nullable: true })
assignedScope!: 'division' | 'battery' | null;

@Column({ name: 'sent_by_user_id', type: 'uuid', nullable: true })
sentByUserId!: string | null;

@Column({ name: 'accepted_by_user_id', type: 'uuid', nullable: true })
acceptedByUserId!: string | null;

@Column({ name: 'completed_by_user_id', type: 'uuid', nullable: true })
completedByUserId!: string | null;

}