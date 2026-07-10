import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServiceOrderActualShotConfiguration } from './service-order-actual-shot-configuration.entity';

@Entity('service_order_actual_shot_configuration_charges')
@Check(`"quantity_per_shot" > 0`)
@Check(`"sort_order" >= 0`)
export class ServiceOrderActualShotConfigurationCharge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actual_shot_configuration_id', type: 'uuid' })
  actualShotConfigurationId!: string;

  @ManyToOne(
    () => ServiceOrderActualShotConfiguration,
    (actualShotConfiguration) => actualShotConfiguration.charges,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'actual_shot_configuration_id' })
  actualShotConfiguration!: ServiceOrderActualShotConfiguration;

  @Column({ name: 'charge_id', type: 'uuid' })
  chargeId!: string;

  @Column({ name: 'charge_marking', type: 'varchar', length: 100 })
  chargeMarking!: string;

  @Column({ name: 'accounting_unit', type: 'varchar', length: 10 })
  accountingUnit!: 'piece' | 'module';

  @Column({ name: 'quantity_per_shot', type: 'int' })
  quantityPerShot!: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
