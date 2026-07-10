import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Unit } from '../units/unit.entity';
import { AirAssetPosition } from './air-asset-position.entity';
import { AirAssetTaskPoint } from './air-asset-task-point.entity';
import { DroneModel } from '../drone-logistics/drone-model.entity';
import { DroneWarheadType } from '../drone-logistics/drone-warhead-type.entity';

@Entity('air_asset_tasks')
export class AirAssetTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'task_type', type: 'varchar', length: 30 })
  taskType!: 'recon' | 'combat';

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId!: string;

  @ManyToOne(() => Unit, { nullable: false })
  @JoinColumn({ name: 'unit_id' })
  unit!: Unit;

  @Column({ name: 'air_asset_position_id', type: 'uuid' })
  airAssetPositionId!: string;

  @ManyToOne(() => AirAssetPosition, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'air_asset_position_id' })
  airAssetPosition!: AirAssetPosition;

  @Column({ name: 'drone_model_id', type: 'uuid', nullable: true })
  droneModelId!: string | null;

  @ManyToOne(() => DroneModel, { nullable: true })
  @JoinColumn({ name: 'drone_model_id' })
  droneModel!: DroneModel | null;

  @Column({ name: 'warhead_type_id', type: 'uuid', nullable: true })
  warheadTypeId!: string | null;

  @ManyToOne(() => DroneWarheadType, { nullable: true })
  @JoinColumn({ name: 'warhead_type_id' })
  warheadType!: DroneWarheadType | null;

  @Column({ name: 'area_name', type: 'varchar', length: 255 })
  areaName!: string;

  @Column({ name: 'planned_start_at', type: 'timestamp', nullable: true })
  plannedStartAt!: Date | null;

  @Column({ name: 'planned_end_at', type: 'timestamp', nullable: true })
  plannedEndAt!: Date | null;

  @Column({ type: 'varchar', length: 50, default: 'planned' })
  status!: 'planned' | 'sent' | 'in_progress' | 'completed' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @OneToMany(() => AirAssetTaskPoint, (point) => point.task, { cascade: true })
  points!: AirAssetTaskPoint[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
