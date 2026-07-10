import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlannedVehicleTrip } from './planned-vehicle-trip.entity';

@Entity('planned_vehicle_trip_checkpoints')
export class PlannedVehicleTripCheckpoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'trip_id', type: 'uuid' })
  tripId!: string;

  @ManyToOne(() => PlannedVehicleTrip, (trip) => trip.checkpoints, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip!: PlannedVehicleTrip;

  @Column({ name: 'route_point_id', type: 'uuid', nullable: true })
  routePointId!: string | null;

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

  @Column({ name: 'passed_at', type: 'timestamp', nullable: true })
  passedAt!: Date | null;
}
