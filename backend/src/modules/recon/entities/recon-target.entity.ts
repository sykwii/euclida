import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('recon_targets')
export class ReconTarget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'platform_id', type: 'varchar', length: 120, nullable: true })
  platformId!: string | null;

  @Column({ name: 'target_type', type: 'varchar', length: 60 })
  targetType!: string;

  @Column({ name: 'possible_target_types', type: 'jsonb', default: [] })
  possibleTargetTypes!: string[];

  @Column({ type: 'varchar', length: 40, default: 'candidate' })
  status!: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  center!: unknown;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ type: 'varchar', length: 40 })
  mgrs!: string;

  @Column({ name: 'semi_major_m', type: 'double precision', default: 250 })
  semiMajorM!: number;

  @Column({ name: 'semi_minor_m', type: 'double precision', default: 120 })
  semiMinorM!: number;

  @Column({ name: 'azimuth_deg', type: 'double precision', default: 0 })
  azimuthDeg!: number;

  @Column({ name: 'confidence_index', type: 'integer', default: 0 })
  confidenceIndex!: number;

  @Column({ name: 'confidence_label', type: 'varchar', length: 40, default: 'low' })
  confidenceLabel!: string;

  @Column({ name: 'activity_index', type: 'integer', default: 0 })
  activityIndex!: number;

  @Column({ name: 'freshness_index', type: 'integer', default: 0 })
  freshnessIndex!: number;

  @Column({ name: 'threat_index', type: 'integer', default: 0 })
  threatIndex!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;
}
