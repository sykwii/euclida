import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Depot } from '../depots/depot.entity';
import { DroneWarheadType } from './drone-warhead-type.entity';

@Entity('depot_drone_warhead_stock')
export class DepotDroneWarheadStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'depot_id', type: 'uuid' })
  depotId: string;

  @ManyToOne(() => Depot, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depot_id' })
  depot: Depot;

  @Column({ name: 'warhead_type_id', type: 'uuid' })
  warheadTypeId: string;

  @ManyToOne(() => DroneWarheadType, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warhead_type_id' })
  warheadType: DroneWarheadType;

  @Column({ type: 'numeric', precision: 18, scale: 3, default: 0 })
  quantity: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
