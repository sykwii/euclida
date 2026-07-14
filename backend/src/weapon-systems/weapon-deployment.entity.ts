import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WeaponSystem } from './weapon-system.entity';

@Entity('weapon_deployments')
export class WeaponDeployment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'weapon_system_id', type: 'uuid' })
  weaponSystemId!: string;

  @ManyToOne(() => WeaponSystem, (item) => item.deployments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'weapon_system_id' })
  weaponSystem!: WeaponSystem;

  @Column({ name: 'from_location_type', type: 'varchar', length: 30, nullable: true })
  fromLocationType!: string | null;

  @Column({ name: 'from_location_id', type: 'uuid', nullable: true })
  fromLocationId!: string | null;

  @Column({ name: 'to_location_type', type: 'varchar', length: 30, nullable: true })
  toLocationType!: string | null;

  @Column({ name: 'to_location_id', type: 'uuid', nullable: true })
  toLocationId!: string | null;

  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ name: 'ordered_at', type: 'timestamp' })
  orderedAt!: Date;

  @Column({ name: 'departed_at', type: 'timestamp', nullable: true })
  departedAt!: Date | null;

  @Column({ name: 'arrived_at', type: 'timestamp', nullable: true })
  arrivedAt!: Date | null;

  @Column({ name: 'ordered_by_user_id', type: 'uuid', nullable: true })
  orderedByUserId!: string | null;

  @Column({ name: 'confirmed_by_user_id', type: 'uuid', nullable: true })
  confirmedByUserId!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
