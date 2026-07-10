import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServiceOrder } from './service-order.entity';
import { ServiceOrderActualShotConfigurationCharge } from './service-order-actual-shot-configuration-charge.entity';

@Entity('service_order_actual_shot_configurations')
export class ServiceOrderActualShotConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_order_id', type: 'uuid', unique: true })
  serviceOrderId!: string;

  @ManyToOne(() => ServiceOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder!: ServiceOrder;

  @Column({ name: 'shot_configuration_id', type: 'uuid', nullable: true })
  shotConfigurationId!: string | null;

  @Column({ name: 'configuration_name', type: 'varchar', length: 255 })
  configurationName!: string;

  @Column({ name: 'weapon_model_id', type: 'uuid', nullable: true })
  weaponModelId!: string | null;

  @Column({ name: 'shell_id', type: 'uuid' })
  shellId!: string;

  @Column({ name: 'shell_marking', type: 'varchar', length: 100 })
  shellMarking!: string;

  @Column({ name: 'fuze_id', type: 'uuid', nullable: true })
  fuzeId!: string | null;

  @Column({ name: 'fuze_marking', type: 'varchar', length: 100, nullable: true })
  fuzeMarking!: string | null;

  @Column({ name: 'primer_id', type: 'uuid', nullable: true })
  primerId!: string | null;

  @Column({ name: 'primer_marking', type: 'varchar', length: 100, nullable: true })
  primerMarking!: string | null;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true })
  zoneId!: string | null;

  @Column({ name: 'zone_number', type: 'int', nullable: true })
  zoneNumber!: number | null;

  @Column({ name: 'max_range_m', type: 'int' })
  maxRangeM!: number;

  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => ServiceOrderActualShotConfigurationCharge, (charge) => charge.actualShotConfiguration, {
    cascade: false,
  })
  charges!: ServiceOrderActualShotConfigurationCharge[];
}
