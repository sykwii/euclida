import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ExecutionRecordArtillery } from './execution-record-artillery.entity';

export type ExecutionChargeAccountingUnit = 'piece' | 'module';

@Entity('execution_record_charge_components')
export class ExecutionRecordCharge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'execution_record_id', type: 'uuid' })
  executionRecordId!: string;

  @ManyToOne(() => ExecutionRecordArtillery, (artillery) => artillery.charges, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'execution_record_id' })
  artillery!: ExecutionRecordArtillery;

  @Column({ name: 'charge_id', type: 'uuid' })
  chargeId!: string;

  @Column({ name: 'charge_name_snapshot', type: 'varchar', length: 255 })
  chargeNameSnapshot!: string;

  @Column({ name: 'quantity_per_shot', type: 'int' })
  quantityPerShot!: number;

  @Column({ name: 'accounting_unit', type: 'varchar', length: 20 })
  accountingUnit!: ExecutionChargeAccountingUnit;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
