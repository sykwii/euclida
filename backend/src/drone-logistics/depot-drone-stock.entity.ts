import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Depot } from '../depots/depot.entity';
import { DroneModel } from './drone-model.entity';

@Entity('depot_drone_stock')
export class DepotDroneStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'depot_id', type: 'uuid' })
  depotId: string;

  @ManyToOne(() => Depot, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depot_id' })
  depot: Depot;

  @Column({ name: 'drone_model_id', type: 'uuid' })
  droneModelId: string;

  @ManyToOne(() => DroneModel, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'drone_model_id' })
  droneModel: DroneModel;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
