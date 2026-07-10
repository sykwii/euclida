import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AirAssetPosition } from '../air-assets/air-asset-position.entity';
import { DroneWarheadType } from './drone-warhead-type.entity';

@Entity('air_asset_warhead_stock')
export class AirAssetWarheadStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'air_asset_position_id', type: 'uuid' })
  airAssetPositionId: string;

  @ManyToOne(() => AirAssetPosition, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'air_asset_position_id' })
  airAssetPosition: AirAssetPosition;

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
