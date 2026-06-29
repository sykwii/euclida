import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WeaponModel } from '../weapon-models/weapon-model.entity';

@Entity('zones')
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'weapon_model_id', type: 'uuid' })
  weaponModelId!: string;

  @ManyToOne(() => WeaponModel)
  @JoinColumn({ name: 'weapon_model_id' })
  weaponModel!: WeaponModel;

  @Column({ name: 'zone_number', type: 'int' })
  zoneNumber!: number;

  @Column({ name: 'distance_from_m', type: 'int' })
  distanceFromM!: number;

  @Column({ name: 'distance_to_m', type: 'int' })
  distanceToM!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}