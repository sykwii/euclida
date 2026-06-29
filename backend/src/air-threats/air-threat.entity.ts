import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('air_threats')
export class AirThreat {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'threat_type', type: 'varchar', length: 100 })
  threatType!: string;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'removed_at', type: 'timestamp', nullable: true })
  removedAt!: Date | null;
}