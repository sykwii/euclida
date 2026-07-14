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

@Entity('weapon_maintenances')
export class WeaponMaintenance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'weapon_system_id', type: 'uuid' })
  weaponSystemId!: string;

  @ManyToOne(() => WeaponSystem, (item) => item.maintenances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'weapon_system_id' })
  weaponSystem!: WeaponSystem;

  @Column({ type: 'varchar', length: 30 })
  reason!: string;

  @Column({ type: 'varchar', length: 30 })
  status!: string;

  @Column({ name: 'started_at', type: 'timestamp' })
  startedAt!: Date;

  @Column({ name: 'expected_completed_at', type: 'timestamp', nullable: true })
  expectedCompletedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  result!: string | null;

  @Column({ name: 'opened_by_user_id', type: 'uuid', nullable: true })
  openedByUserId!: string | null;

  @Column({ name: 'completed_by_user_id', type: 'uuid', nullable: true })
  completedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
