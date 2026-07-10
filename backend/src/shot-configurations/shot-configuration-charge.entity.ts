import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Charge } from '../charges/charge.entity';
import { ShotConfiguration } from './shot-configuration.entity';

export type ShotChargeAccountingUnit = 'piece' | 'module';

@Entity('shot_configuration_charges')
@Check(`"quantity_per_shot" > 0`)
@Check(`"sort_order" >= 0`)
export class ShotConfigurationCharge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'shot_configuration_id', type: 'uuid' })
  shotConfigurationId!: string;

  @ManyToOne(() => ShotConfiguration, (shotConfiguration) => shotConfiguration.charges, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'shot_configuration_id' })
  shotConfiguration!: ShotConfiguration;

  @Column({ name: 'charge_id', type: 'uuid' })
  chargeId!: string;

  @ManyToOne(() => Charge)
  @JoinColumn({ name: 'charge_id' })
  charge!: Charge;

  @Column({ name: 'quantity_per_shot', type: 'int' })
  quantityPerShot!: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
