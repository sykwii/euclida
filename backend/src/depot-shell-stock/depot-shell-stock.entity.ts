import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Depot } from '../depots/depot.entity';
import { Shell } from '../shells/shell.entity';

@Entity('depot_shell_stock')
export class DepotShellStock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'depot_id', type: 'uuid' })
  depotId!: string;

  @ManyToOne(() => Depot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depot_id' })
  depot!: Depot;

  @Column({ name: 'shell_id', type: 'uuid' })
  shellId!: string;

  @ManyToOne(() => Shell)
  @JoinColumn({ name: 'shell_id' })
  shell!: Shell;

  @Column({ type: 'int', default: 0 })
  quantity!: number;
}
