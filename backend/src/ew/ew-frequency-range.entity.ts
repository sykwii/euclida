import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EwPosition } from './ew-position.entity';

@Entity('ew_frequency_ranges')
export class EwFrequencyRange {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ew_position_id', type: 'uuid' })
  ewPositionId!: string;

  @ManyToOne(() => EwPosition, (position) => position.frequencyRanges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ew_position_id' })
  ewPosition!: EwPosition;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label!: string | null;

  @Column({ name: 'frequency_from_mhz', type: 'numeric', precision: 12, scale: 3 })
  frequencyFromMhz!: number;

  @Column({ name: 'frequency_to_mhz', type: 'numeric', precision: 12, scale: 3 })
  frequencyToMhz!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
