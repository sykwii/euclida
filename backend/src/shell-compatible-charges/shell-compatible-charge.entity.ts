import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Charge } from '../charges/charge.entity';
import { Shell } from '../shells/shell.entity';
import { Zone } from '../zones/zone.entity';

@Entity('shell_compatible_charges')
export class ShellCompatibleCharge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'shell_id', type: 'uuid' })
  shellId: string;

  @ManyToOne(() => Shell, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shell_id' })
  shell: Shell;

  @Column({ name: 'charge_id', type: 'uuid' })
  chargeId: string;

  @ManyToOne(() => Charge, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'charge_id' })
  charge: Charge;

  @Column({ name: 'max_range_m', type: 'int' })
  maxRangeM: number;

  @Column({ name: 'usable_modules', type: 'int', nullable: true })
  usableModules!: number | null;

  @Column({ name: 'compatibility_note', type: 'text', nullable: true })
  compatibilityNote!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true })
zoneId!: string | null;

@ManyToOne(() => Zone, { nullable: true })
@JoinColumn({ name: 'zone_id' })
zone!: Zone | null;
}
