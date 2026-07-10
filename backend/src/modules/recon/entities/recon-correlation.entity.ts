import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('recon_correlations')
export class ReconCorrelation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, default: 'suggested' })
  status!: string;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId!: string | null;

  @Column({ name: 'impact_id', type: 'uuid', nullable: true })
  impactId!: string | null;

  @Column({ type: 'integer', default: 0 })
  score!: number;

  @Column({ name: 'reason_json', type: 'jsonb', default: {} })
  reasonJson!: Record<string, unknown>;

  @Column({ name: 'distance_m', type: 'double precision', default: 0 })
  distanceM!: number;

  @Column({ name: 'time_delta_sec', type: 'integer', default: 0 })
  timeDeltaSec!: number;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
