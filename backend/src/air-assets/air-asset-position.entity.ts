import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Unit } from '../units/unit.entity';
import { AirReconArea } from './air-recon-area.entity';

@Entity('air_asset_positions')
export class AirAssetPosition {
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

  @Column({ name: 'asset_group', type: 'varchar', length: 30 })
  assetGroup!: 'recon' | 'combat';

  @Column({ name: 'recon_type', type: 'varchar', length: 60, nullable: true })
  reconType!: 'copter' | 'fixed_wing' | null;

  @Column({ name: 'combat_type', type: 'varchar', length: 60, nullable: true })
  combatType!: 'fpv_radio' | 'fpv_fiber' | 'kamikaze' | 'heavy_bomber' | null;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  mgrs!: string | null;

  @Column({ name: 'readiness_status', type: 'varchar', length: 100, default: 'ready' })
  readinessStatus!: string;

  @Column({ name: 'not_ready_reason', type: 'text', nullable: true })
  notReadyReason!: string | null;

  @Column({ name: 'personnel_rotation_date', type: 'date', nullable: true })
  personnelRotationDate!: string | null;

  @Column({ name: 'asset_name', type: 'varchar', length: 255, nullable: true })
  assetName!: string | null;

  @Column({ name: 'drone_model', type: 'varchar', length: 255, nullable: true })
  droneModel!: string | null;

  @Column({ name: 'asset_quantity', type: 'int', default: 0 })
  assetQuantity!: number;

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

  @Column({ name: 'max_sector_distance_m', type: 'int', nullable: true })
  maxSectorDistanceM!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @OneToMany(() => AirReconArea, (area) => area.airAssetPosition, { cascade: true })
  reconAreas!: AirReconArea[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
