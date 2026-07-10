import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, ValueTransformer } from 'typeorm';

const decimalNumericTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) =>
    value === null || value === undefined ? null : Number(value),
};

@Entity('drone_models')
export class DroneModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'drone_group', length: 50 })
  droneGroup: string;

  @Column({ name: 'drone_type', length: 50 })
  droneType: string;

  @Column({ name: 'camera_type', length: 50, default: 'none' })
  cameraType: 'none' | 'day' | 'night' | 'thermal' | 'day_night';

@Column({ name: 'max_range_m', type: 'integer', nullable: true })
maxRangeM: number | null;

@Column({ name: 'cruise_speed_kmh', type: 'integer', nullable: true })
cruiseSpeedKmh: number | null;

@Column({ name: 'endurance_minutes', type: 'integer', nullable: true })
enduranceMinutes: number | null;

@Column({
  name: 'payload_capacity_kg',
  type: 'numeric',
  precision: 10,
  scale: 3,
  nullable: true,
  transformer: decimalNumericTransformer,
})
payloadCapacityKg: number | null;

@Column({ name: 'max_altitude_m', type: 'integer', nullable: true })
maxAltitudeM: number | null;

@Column({
  name: 'max_wind_ms',
  type: 'numeric',
  precision: 10,
  scale: 2,
  nullable: true,
  transformer: decimalNumericTransformer,
})
maxWindMs: number | null;


  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
