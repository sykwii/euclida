import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Unit } from '../units/unit.entity';
import { EwFrequencyRange } from './ew-frequency-range.entity';

@Entity('ew_positions')
export class EwPosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId!: string;

  @ManyToOne(() => Unit, { nullable: false })
  @JoinColumn({ name: 'unit_id' })
  unit!: Unit;

  @Column({ type: 'varchar', length: 100 })
  callsign!: string;

  @Column({ name: 'station_name', type: 'varchar', length: 255 })
  stationName!: string;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  mgrs!: string | null;

  @Column({ name: 'effect_mode', type: 'varchar', length: 30, default: 'radius' })
  effectMode!: 'radius' | 'sector';

  @Column({ name: 'radius_m', type: 'int', nullable: true })
  radiusM!: number | null;

  @Column({ name: 'main_direction_units', type: 'numeric', precision: 10, scale: 2, nullable: true })
  mainDirectionUnits!: number | null;

  @Column({ name: 'main_direction_degrees', type: 'numeric', precision: 10, scale: 2, nullable: true })
  mainDirectionDegrees!: number | null;

  @Column({ name: 'traverse_left_units', type: 'numeric', precision: 10, scale: 2, nullable: true })
  traverseLeftUnits!: number | null;

  @Column({ name: 'traverse_left_degrees', type: 'numeric', precision: 10, scale: 2, nullable: true })
  traverseLeftDegrees!: number | null;

  @Column({ name: 'traverse_right_units', type: 'numeric', precision: 10, scale: 2, nullable: true })
  traverseRightUnits!: number | null;

  @Column({ name: 'traverse_right_degrees', type: 'numeric', precision: 10, scale: 2, nullable: true })
  traverseRightDegrees!: number | null;

  @Column({ name: 'sector_left_degrees', type: 'integer', nullable: true })
  sectorLeftDegrees!: number | null;

  @Column({ name: 'sector_right_degrees', type: 'integer', nullable: true })
  sectorRightDegrees!: number | null;

  @Column({ name: 'readiness_status', type: 'varchar', length: 100, default: 'ready' })
  readinessStatus!: string;

  @Column({ name: 'not_ready_reason', type: 'text', nullable: true })
  notReadyReason!: string | null;

  @Column({ name: 'personnel_rotation_date', type: 'date', nullable: true })
  personnelRotationDate!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @OneToMany(() => EwFrequencyRange, (range) => range.ewPosition, { cascade: true })
  frequencyRanges!: EwFrequencyRange[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
