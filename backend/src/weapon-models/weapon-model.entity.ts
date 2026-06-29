import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('weapon_models')
export class WeaponModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'system_type', length: 50 })
  systemType: string;

  @Column({ name: 'zones_count', type: 'int', default: 0 })
  zonesCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}