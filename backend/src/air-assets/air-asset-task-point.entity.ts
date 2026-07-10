import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AirAssetTask } from './air-asset-task.entity';

@Entity('air_asset_task_points')
export class AirAssetTaskPoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @ManyToOne(() => AirAssetTask, (task) => task.points, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: AirAssetTask;

  @Column({ name: 'point_order', type: 'int' })
  pointOrder!: number;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;
}
