import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Unit } from '../units/unit.entity';
import { WeaponModel } from '../weapon-models/weapon-model.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';

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

  @Column({ name: 'readiness_status', type: 'varchar', length: 100, default: 'unknown' })
  readinessStatus!: string;

  @Column({ name: 'not_ready_reason', type: 'text', nullable: true })
  notReadyReason!: string | null;

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
}