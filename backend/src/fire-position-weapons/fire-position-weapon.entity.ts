import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Column } from 'typeorm';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';

@Entity('fire_position_weapons')
export class FirePositionWeapon {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'fire_position_id', type: 'uuid' })
  firePositionId!: string;

  @ManyToOne(() => FirePosition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fire_position_id' })
  firePosition!: FirePosition;

  @Column({ name: 'weapon_system_id', type: 'uuid' })
  weaponSystemId!: string;

  @ManyToOne(() => WeaponSystem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'weapon_system_id' })
  weaponSystem!: WeaponSystem;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt!: Date;

  @Column({ name: 'removed_at', type: 'timestamp', nullable: true })
  removedAt!: Date | null;
}