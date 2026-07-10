import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('recon_target_observations')
export class ReconTargetObservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ name: 'observation_id', type: 'uuid' })
  observationId!: string;

  @Column({ name: 'link_type', type: 'varchar', length: 40, default: 'clustered' })
  linkType!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
