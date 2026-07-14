import { Column, Entity, JoinColumn, OneToMany, OneToOne, PrimaryColumn } from 'typeorm';
import { ExecutionRecord } from './execution-record.entity';
import { ExecutionRecordCharge } from './execution-record-charge.entity';

export type CompositionSource = 'planned' | 'template' | 'manual';

@Entity('execution_record_artillery')
export class ExecutionRecordArtillery {
  @PrimaryColumn({ name: 'execution_record_id', type: 'uuid' })
  executionRecordId!: string;

  @OneToOne(() => ExecutionRecord, (record) => record.artillery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'execution_record_id' })
  executionRecord!: ExecutionRecord;

  @Column({ name: 'composition_source', type: 'varchar', length: 20 })
  compositionSource!: CompositionSource;

  @Column({ name: 'source_shot_configuration_id', type: 'uuid', nullable: true })
  sourceShotConfigurationId!: string | null;

  @Column({ name: 'weapon_model_id', type: 'uuid' })
  weaponModelId!: string;

  @Column({ name: 'shell_id', type: 'uuid' })
  shellId!: string;

  @Column({ name: 'fuze_id', type: 'uuid' })
  fuzeId!: string;

  @Column({ name: 'primer_id', type: 'uuid' })
  primerId!: string;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true })
  zoneId!: string | null;

  @Column({ name: 'max_range_m', type: 'int' })
  maxRangeM!: number;

  @Column({ name: 'composition_snapshot', type: 'jsonb' })
  compositionSnapshot!: Record<string, unknown>;

  @OneToMany(() => ExecutionRecordCharge, (charge) => charge.artillery)
  charges!: ExecutionRecordCharge[];
}
