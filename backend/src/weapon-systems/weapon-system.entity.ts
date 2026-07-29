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
import { WeaponModel } from '../weapon-models/weapon-model.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { WeaponDeployment } from './weapon-deployment.entity';
import { WeaponMaintenance } from './weapon-maintenance.entity';
import { Depot } from '../depots/depot.entity';

@Entity('weapon_systems')
export class WeaponSystem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'weapon_model_id', type: 'uuid' })
  weaponModelId!: string;

  @ManyToOne(() => WeaponModel)
  @JoinColumn({ name: 'weapon_model_id' })
  weaponModel!: WeaponModel;

  @Column({ name: 'serial_number', type: 'varchar', length: 255, nullable: true })
  serialNumber!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  callsign!: string | null;

  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId!: string | null;

  @ManyToOne(() => Unit, { nullable: true })
  @JoinColumn({ name: 'unit_id' })
  unit!: Unit | null;

  @Column({ type: 'double precision', nullable: true })
  lat!: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng!: number | null;

  @Column({ name: 'ammo_depot_id', type: 'uuid', nullable: true })
  ammoDepotId!: string | null;

  @ManyToOne(() => Depot, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ammo_depot_id' })
  ammoDepot!: Depot | null;

  @Column({
    name: 'readiness_status',
    type: 'varchar',
    length: 100,
    default: 'not_combat_ready',
  })
  readinessStatus!: string;

  @Column({ name: 'not_ready_reason', type: 'text', nullable: true })
  notReadyReason!: string | null;

  @Column({
    name: 'deployment_status',
    type: 'varchar',
    length: 40,
    default: 'reserve_area',
  })
  deploymentStatus!: string;

  @Column({ name: 'current_fire_position_id', type: 'uuid', nullable: true })
  currentFirePositionId!: string | null;

  @ManyToOne(() => FirePosition, { nullable: true })
  @JoinColumn({ name: 'current_fire_position_id' })
  currentFirePosition!: FirePosition | null;

  @Column({ name: 'maintenance_status', type: 'varchar', length: 30, nullable: true })
  maintenanceStatus!: string | null;

  @Column({ name: 'maintenance_requested_start_at', type: 'timestamp', nullable: true })
  maintenanceRequestedStartAt!: Date | null;

  @Column({ name: 'maintenance_planned_end_at', type: 'timestamp', nullable: true })
  maintenancePlannedEndAt!: Date | null;

  @Column({ name: 'maintenance_actual_end_at', type: 'timestamp', nullable: true })
  maintenanceActualEndAt!: Date | null;

  @Column({ name: 'maintenance_note', type: 'text', nullable: true })
  maintenanceNote!: string | null;

  @Column({ name: 'maintenance_requested_by_user_id', type: 'uuid', nullable: true })
  maintenanceRequestedByUserId!: string | null;

  @Column({ name: 'maintenance_approved_by_user_id', type: 'uuid', nullable: true })
  maintenanceApprovedByUserId!: string | null;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived!: boolean;

  @Column({ name: 'archived_at', type: 'timestamp', nullable: true })
  archivedAt!: Date | null;

  @Column({ name: 'archived_by_user_id', type: 'uuid', nullable: true })
  archivedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'location_type', type: 'varchar', length: 30, default: 'reserve' })
locationType!: string;

@Column({ name: 'fire_position_id', type: 'uuid', nullable: true })
firePositionId!: string | null;

  @ManyToOne(() => FirePosition, { nullable: true })
  @JoinColumn({ name: 'fire_position_id' })
  firePosition!: FirePosition | null;

  @OneToMany(() => WeaponMaintenance, (item) => item.weaponSystem)
  maintenances!: WeaponMaintenance[];

  @OneToMany(() => WeaponDeployment, (item) => item.weaponSystem)
  deployments!: WeaponDeployment[];

  activeMaintenance?: WeaponMaintenance | null;

  hasHistoricalReferences?: boolean;
}
