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
import { Fuze } from '../fuzes/fuze.entity';
import { Primer } from '../primers/primer.entity';
import { Shell } from '../shells/shell.entity';
import { WeaponModel } from '../weapon-models/weapon-model.entity';
import { ShotConfigurationCharge } from './shot-configuration-charge.entity';

@Entity('shot_configurations')
export class ShotConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'weapon_model_id', type: 'uuid' })
  weaponModelId!: string;

  @ManyToOne(() => WeaponModel)
  @JoinColumn({ name: 'weapon_model_id' })
  weaponModel!: WeaponModel;

  @Column({ name: 'shell_id', type: 'uuid' })
  shellId!: string;

  @ManyToOne(() => Shell)
  @JoinColumn({ name: 'shell_id' })
  shell!: Shell;

  @Column({ name: 'fuze_id', type: 'uuid', nullable: true })
  fuzeId!: string | null;

  @ManyToOne(() => Fuze, { nullable: true })
  @JoinColumn({ name: 'fuze_id' })
  fuze!: Fuze | null;

  @Column({ name: 'primer_id', type: 'uuid', nullable: true })
  primerId!: string | null;

  @ManyToOne(() => Primer, { nullable: true })
  @JoinColumn({ name: 'primer_id' })
  primer!: Primer | null;

  @Column({ name: 'zone_number', type: 'int', nullable: true })
  zoneNumber!: number | null;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true })
  zoneId!: string | null;

  @Column({ name: 'max_range_m', type: 'int' })
  maxRangeM!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => ShotConfigurationCharge, (charge) => charge.shotConfiguration, {
    cascade: false,
  })
  charges!: ShotConfigurationCharge[];
}
