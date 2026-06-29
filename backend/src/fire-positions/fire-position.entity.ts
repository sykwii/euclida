import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Unit } from '../units/unit.entity';
import { Depot } from '../depots/depot.entity';

@Entity('fire_positions')
export class FirePosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId!: string | null;

  @ManyToOne(() => Unit, { nullable: true })
  @JoinColumn({ name: 'unit_id' })
  unit!: Unit | null;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  mgrs!: string | null;

  @Column({ name: 'main_direction', type: 'varchar', length: 255, nullable: true })
  mainDirection!: string | null;

  @Column({ name: 'traverse_limits', type: 'varchar', length: 255, nullable: true })
  traverseLimits!: string | null;

  @Column({ name: 'has_sg', type: 'boolean', default: false })
  hasSg!: boolean;

  @Column({ name: 'readiness_status', type: 'varchar', length: 100, default: 'unknown' })
  readinessStatus!: string;

  @Column({ name: 'not_ready_reason', type: 'text', nullable: true })
  notReadyReason!: string | null;

  @Column({ name: 'completed_vgz_count', type: 'int', default: 0 })
  completedVgzCount!: number;

  @Column({ name: 'personnel_rotation_status', type: 'varchar', length: 100, nullable: true })
  personnelRotationStatus!: string | null;

  @Column({ name: 'air_situation_status', type: 'varchar', length: 100, nullable: true })
  airSituationStatus!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

 @Column({ name: 'ammo_depot_id', type: 'uuid', nullable: true })
ammoDepotId!: string | null;

@Column({ name: 'main_direction_units', type: 'numeric', precision: 10, scale: 2, nullable: true })
mainDirectionUnits!: number | null;

@Column({ name: 'main_direction_degrees', type: 'numeric', precision: 10, scale: 2, nullable: true })
mainDirectionDegrees!: number | null;

@Column({ name: 'traverse_left_degrees', type: 'numeric', precision: 10, scale: 2, nullable: true })
traverseLeftDegrees!: number | null;

@Column({ name: 'traverse_right_degrees', type: 'numeric', precision: 10, scale: 2, nullable: true })
traverseRightDegrees!: number | null;


@Column({ name: 'traverse_left_units', type: 'numeric', precision: 10, scale: 2, nullable: true })
traverseLeftUnits!: number | null;

@Column({ name: 'traverse_right_units', type: 'numeric', precision: 10, scale: 2, nullable: true })
traverseRightUnits!: number | null;

@Column({ name: 'sector_left_degrees', type: 'integer', nullable: true })
sectorLeftDegrees!: number | null;

@Column({ name: 'sector_right_degrees', type: 'integer', nullable: true })
sectorRightDegrees!: number | null;

@Column({ name: 'personnel_rotation_date', type: 'date', nullable: true })
personnelRotationDate!: string | null;

@ManyToOne(() => Depot, { nullable: true })
@JoinColumn({ name: 'ammo_depot_id' })
ammoDepot!: Depot | null;
}