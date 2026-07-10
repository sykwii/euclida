import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, ValueTransformer } from 'typeorm';

const decimalNumericTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) =>
    value === null || value === undefined ? null : Number(value),
};

@Entity('drone_warhead_types')
export class DroneWarheadType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({
    name: 'weight_kg',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalNumericTransformer,
  })
  weightKg: number | null;

  @Column({ name: 'measure_unit', length: 20, default: 'unit' })
  measureUnit: 'unit' | 'kg';

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
