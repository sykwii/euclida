import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('recon_observations')
export class ReconObservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'platform_id', type: 'varchar', length: 120, nullable: true })
  platformId!: string | null;

  @Column({ name: 'external_id', type: 'varchar', length: 160, nullable: true })
  externalId!: string | null;

  @Column({ type: 'varchar', length: 60 })
  source!: string;

  @Column({ name: 'input_provider', type: 'varchar', length: 40, default: 'manual' })
  inputProvider!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 60 })
  targetType!: string;

  @Column({ name: 'observation_datetime', type: 'timestamptz' })
  observationDatetime!: Date;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ type: 'varchar', length: 40 })
  mgrs!: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  geometry!: unknown;

  @Column({ name: 'raw_payload', type: 'jsonb', default: {} })
  rawPayload!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 40, default: 'active' })
  status!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
