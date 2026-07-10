import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AirAssetPosition } from '../air-assets/air-asset-position.entity';
import { DroneModel } from './drone-model.entity';

@Entity('air_asset_drone_stock')
export class AirAssetDroneStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'air_asset_position_id', type: 'uuid' })
  airAssetPositionId: string;

  @ManyToOne(() => AirAssetPosition, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'air_asset_position_id' })
  airAssetPosition: AirAssetPosition;

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
