import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlannedRoute } from './planned-route.entity';

@Entity('planned_route_points')
export class PlannedRoutePoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'route_id', type: 'uuid' })
  routeId!: string;

  @ManyToOne(() => PlannedRoute, (route) => route.points, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'route_id' })
  route!: PlannedRoute;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ name: 'is_control', type: 'boolean', default: false })
  isControl!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
