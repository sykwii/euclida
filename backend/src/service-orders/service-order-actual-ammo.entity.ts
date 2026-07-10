import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';
import { Charge } from '../charges/charge.entity';
import { Shell } from '../shells/shell.entity';
import { ServiceOrder } from './service-order.entity';

const integerNumericTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) =>
    value === null || value === undefined ? null : Math.trunc(Number(value)),
};

const decimalNumericTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) =>
    value === null || value === undefined ? null : Number(value),
};

@Entity('service_order_actual_ammo')
export class ServiceOrderActualAmmo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_order_id', type: 'uuid' })
  serviceOrderId!: string;

  @ManyToOne(() => ServiceOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder!: ServiceOrder;

  @Column({ name: 'shell_id', type: 'uuid' })
  shellId!: string;

  @ManyToOne(() => Shell)
  @JoinColumn({ name: 'shell_id' })
  shell!: Shell;

  @Column({ name: 'charge_id', type: 'uuid' })
  chargeId!: string;

  @ManyToOne(() => Charge)
  @JoinColumn({ name: 'charge_id' })
  charge!: Charge;

  @Column({
    name: 'shot_quantity',
    type: 'numeric',
    transformer: integerNumericTransformer,
  })
  shotQuantity!: number;

  @Column({
    name: 'charge_quantity',
    type: 'numeric',
    precision: 18,
    scale: 3,
    transformer: decimalNumericTransformer,
  })
  chargeQuantity!: number;

  @Column({ name: 'charge_modules_per_shot', type: 'int', nullable: true })
  chargeModulesPerShot!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
