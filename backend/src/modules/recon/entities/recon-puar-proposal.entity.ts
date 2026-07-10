import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('recon_puar_proposals')
export class ReconPuarProposal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId!: string | null;

  @Column({ name: 'observation_id', type: 'uuid', nullable: true })
  observationId!: string | null;

  @Column({ name: 'source_kind', type: 'varchar', length: 40, default: 'target' })
  sourceKind!: string;

  @Column({ type: 'varchar', length: 40, default: 'draft' })
  status!: string;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  comments!: string | null;

  @Column({ name: 'accepted_service_order_id', type: 'uuid', nullable: true })
  acceptedServiceOrderId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
