import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlannedRoute } from './planned-route.entity';
import { PlannedVehicleTripCheckpoint } from './planned-vehicle-trip-checkpoint.entity';

@Entity('planned_vehicle_trips')
export class PlannedVehicleTrip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'route_id', type: 'uuid' })
  routeId!: string;

  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId!: string | null;

  @ManyToOne(() => PlannedRoute)
  @JoinColumn({ name: 'route_id' })
  route!: PlannedRoute;

  @Column({ name: 'vehicle_label', type: 'varchar', length: 160 })
  vehicleLabel!: string;

  @Column({ name: 'driver_label', type: 'varchar', length: 160, nullable: true })
  driverLabel!: string | null;

  @Column({ name: 'start_route_point_id', type: 'uuid', nullable: true })
  startRoutePointId!: string | null;

  @Column({ name: 'end_route_point_id', type: 'uuid', nullable: true })
  endRoutePointId!: string | null;

  @Column({ name: 'destination_entity_type', type: 'varchar', length: 40, nullable: true })
  destinationEntityType!: 'fire_position' | 'ew_position' | 'air_recon' | null;

  @Column({ name: 'destination_entity_id', type: 'uuid', nullable: true })
  destinationEntityId!: string | null;

  @Column({ name: 'destination_name', type: 'varchar', length: 160, nullable: true })
  destinationName!: string | null;

  @Column({ name: 'trip_purpose', type: 'text', nullable: true })
  tripPurpose!: string | null;

  @Column({ name: 'planned_start_at', type: 'timestamp', nullable: true })
  plannedStartAt!: Date | null;

  @Column({ type: 'varchar', length: 40, default: 'planned' })
  status!: 'planned' | 'active' | 'completed' | 'cancelled' | 'archived';

  @OneToMany(() => PlannedVehicleTripCheckpoint, (checkpoint) => checkpoint.trip, {
    cascade: true,
  })
  checkpoints!: PlannedVehicleTripCheckpoint[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
