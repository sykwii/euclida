import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Charge } from '../charges/charge.entity';
import { Depot } from '../depots/depot.entity';

@Entity('depot_charge_stock')
export class DepotChargeStock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'depot_id', type: 'uuid' })
  depotId!: string;

  @ManyToOne(() => Depot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depot_id' })
  depot!: Depot;

  @Column({ name: 'charge_id', type: 'uuid' })
  chargeId!: string;

  @ManyToOne(() => Charge)
  @JoinColumn({ name: 'charge_id' })
  charge!: Charge;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  quantity!: number;
}
