import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AirReconArea } from './air-recon-area.entity';

@Entity('air_recon_area_points')
export class AirReconAreaPoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'area_id', type: 'uuid' })
  areaId!: string;

  @ManyToOne(() => AirReconArea, (area) => area.points, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'area_id' })
  area!: AirReconArea;

  @Column({ name: 'point_order', type: 'int' })
  pointOrder!: number;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
