import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ChargeKind = 'unit' | 'modular';

@Entity('charges')
export class Charge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  marking: string;

  @Column({ name: 'packaging_type', length: 50 })
  packagingType: string;

  @Column({ name: 'measurement_unit', length: 50, default: 'шт' })
  measurementUnit: string;

  @Column({ name: 'charge_kind', type: 'varchar', length: 20, default: 'unit' })
  chargeKind: ChargeKind;

  @Column({ name: 'modules_per_charge', type: 'int', nullable: true })
  modulesPerCharge: number | null;

  @Column({ name: 'max_usable_modules', type: 'int', nullable: true })
  maxUsableModules: number | null;

  @Column({ name: 'module_note', type: 'text', nullable: true })
  moduleNote: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
