import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Depot } from '../depots/depot.entity';
import { AirAssetPosition } from '../air-assets/air-asset-position.entity';
import { DroneModel } from './drone-model.entity';
import { DroneWarheadType } from './drone-warhead-type.entity';

@Entity('drone_stock_movements')
export class DroneStockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'movement_type', length: 50 })
  movementType: string;

  @Column({ name: 'item_type', length: 50 })
  itemType: 'drone' | 'warhead';

  @Column({ name: 'depot_from_id', type: 'uuid', nullable: true })
  depotFromId: string | null;

  @ManyToOne(() => Depot, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'depot_from_id' })
  depotFrom: Depot | null;

  @Column({ name: 'depot_to_id', type: 'uuid', nullable: true })
  depotToId: string | null;

  @ManyToOne(() => Depot, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'depot_to_id' })
  depotTo: Depot | null;

  @Column({ name: 'air_asset_from_id', type: 'uuid', nullable: true })
  airAssetFromId: string | null;

  @ManyToOne(() => AirAssetPosition, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'air_asset_from_id' })
  airAssetFrom: AirAssetPosition | null;

  @Column({ name: 'air_asset_to_id', type: 'uuid', nullable: true })
  airAssetToId: string | null;

  @ManyToOne(() => AirAssetPosition, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'air_asset_to_id' })
  airAssetTo: AirAssetPosition | null;

  @Column({ name: 'drone_model_id', type: 'uuid', nullable: true })
  droneModelId: string | null;

  @ManyToOne(() => DroneModel, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'drone_model_id' })
  droneModel: DroneModel | null;

  @Column({ name: 'warhead_type_id', type: 'uuid', nullable: true })
  warheadTypeId: string | null;

  @ManyToOne(() => DroneWarheadType, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'warhead_type_id' })
  warheadType: DroneWarheadType | null;

  @Column({ type: 'numeric', precision: 18, scale: 3 })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
