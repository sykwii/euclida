import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AirAssetPosition } from './air-asset-position.entity';
import { AirReconAreaPoint } from './air-recon-area-point.entity';

@Entity('air_recon_areas')
export class AirReconArea {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'air_asset_position_id', type: 'uuid' })
  airAssetPositionId!: string;

  @ManyToOne(() => AirAssetPosition, (position) => position.reconAreas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'air_asset_position_id' })
  airAssetPosition!: AirAssetPosition;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ name: 'active_date', type: 'date' })
  activeDate!: string;

  @Column({ name: 'planned_start_at', type: 'timestamp', nullable: true })
  plannedStartAt!: Date | null;

  @Column({ name: 'planned_end_at', type: 'timestamp', nullable: true })
  plannedEndAt!: Date | null;

  @Column({ type: 'varchar', length: 50, default: 'planned' })
  status!: 'planned' | 'active' | 'completed' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @OneToMany(() => AirReconAreaPoint, (point) => point.area, { cascade: true })
  points!: AirReconAreaPoint[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
