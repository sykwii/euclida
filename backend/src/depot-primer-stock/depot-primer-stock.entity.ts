import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Depot } from '../depots/depot.entity';
import { Primer } from '../primers/primer.entity';

@Entity('depot_primer_stock')
export class DepotPrimerStock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'depot_id', type: 'uuid' })
  depotId!: string;

  @ManyToOne(() => Depot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depot_id' })
  depot!: Depot;

  @Column({ name: 'primer_id', type: 'uuid' })
  primerId!: string;

  @ManyToOne(() => Primer)
  @JoinColumn({ name: 'primer_id' })
  primer!: Primer;

  @Column({ type: 'int', default: 0 })
  quantity!: number;
}