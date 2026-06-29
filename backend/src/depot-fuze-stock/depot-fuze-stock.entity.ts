import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Depot } from '../depots/depot.entity';
import { Fuze } from '../fuzes/fuze.entity';

@Entity('depot_fuze_stock')
export class DepotFuzeStock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'depot_id', type: 'uuid' })
  depotId!: string;

  @ManyToOne(() => Depot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depot_id' })
  depot!: Depot;

  @Column({ name: 'fuze_id', type: 'uuid' })
  fuzeId!: string;

  @ManyToOne(() => Fuze)
  @JoinColumn({ name: 'fuze_id' })
  fuze!: Fuze;

  @Column({ type: 'int', default: 0 })
  quantity!: number;
}
