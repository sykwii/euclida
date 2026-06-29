import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Charge } from '../charges/charge.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { Fuze } from '../fuzes/fuze.entity';
import { Primer } from '../primers/primer.entity';
import { Shell } from '../shells/shell.entity';
import { Unit } from '../units/unit.entity';
import { User } from '../users/user.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';

@Entity('fire_missions')
export class FireMission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'author_user_id' })
  authorUser!: User | null;

  @Column({ name: 'author_unit_id', type: 'uuid', nullable: true })
  authorUnitId!: string | null;

  @ManyToOne(() => Unit, { nullable: true })
  @JoinColumn({ name: 'author_unit_id' })
  authorUnit!: Unit | null;

  @Column({ name: 'executing_unit_id', type: 'uuid', nullable: true })
  executingUnitId!: string | null;

  @ManyToOne(() => Unit, { nullable: true })
  @JoinColumn({ name: 'executing_unit_id' })
  executingUnit!: Unit | null;

  @Column({ name: 'fire_position_id', type: 'uuid', nullable: true })
  firePositionId!: string | null;

  @ManyToOne(() => FirePosition, { nullable: true })
  @JoinColumn({ name: 'fire_position_id' })
  firePosition!: FirePosition | null;

  @Column({ name: 'weapon_system_id', type: 'uuid', nullable: true })
  weaponSystemId!: string | null;

  @ManyToOne(() => WeaponSystem, { nullable: true })
  @JoinColumn({ name: 'weapon_system_id' })
  weaponSystem!: WeaponSystem | null;

  @Column({ name: 'mission_datetime', type: 'timestamp' })
  missionDatetime!: Date;

  @Column({ name: 'target_number', type: 'varchar', length: 100, nullable: true })
  targetNumber!: string | null;

  @Column({ name: 'target_type', type: 'varchar', length: 255, nullable: true })
  targetType!: string | null;

  @Column({ name: 'target_lat', type: 'double precision', nullable: true })
  targetLat!: number | null;

  @Column({ name: 'target_lng', type: 'double precision', nullable: true })
  targetLng!: number | null;

  @Column({ name: 'target_mgrs', type: 'varchar', length: 50, nullable: true })
  targetMgrs!: string | null;

  @Column({ name: 'target_settlement', type: 'varchar', length: 255, nullable: true })
  targetSettlement!: string | null;

  @Column({ name: 'shell_id', type: 'uuid', nullable: true })
  shellId!: string | null;

  @ManyToOne(() => Shell, { nullable: true })
  @JoinColumn({ name: 'shell_id' })
  shell!: Shell | null;

  @Column({ name: 'shell_quantity', type: 'int', nullable: true })
  shellQuantity!: number | null;

  @Column({ name: 'charge_id', type: 'uuid', nullable: true })
  chargeId!: string | null;

  @ManyToOne(() => Charge, { nullable: true })
  @JoinColumn({ name: 'charge_id' })
  charge!: Charge | null;

  @Column({ name: 'charge_quantity', type: 'numeric', precision: 18, scale: 2, nullable: true })
  chargeQuantity!: number | null;

  @Column({ name: 'primer_id', type: 'uuid', nullable: true })
  primerId!: string | null;

  @ManyToOne(() => Primer, { nullable: true })
  @JoinColumn({ name: 'primer_id' })
  primer!: Primer | null;

  @Column({ name: 'primer_quantity', type: 'int', nullable: true })
  primerQuantity!: number | null;

  @Column({ name: 'fuze_id', type: 'uuid', nullable: true })
  fuzeId!: string | null;

  @ManyToOne(() => Fuze, { nullable: true })
  @JoinColumn({ name: 'fuze_id' })
  fuze!: Fuze | null;

  @Column({ name: 'fuze_quantity', type: 'int', nullable: true })
  fuzeQuantity!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status!: string;

  @Column({ name: 'actual_shell_quantity', type: 'int', nullable: true })
  actualShellQuantity!: number | null;

  @Column({ name: 'actual_charge_quantity', type: 'numeric', precision: 18, scale: 2, nullable: true })
  actualChargeQuantity!: number | null;

  @Column({ name: 'actual_primer_quantity', type: 'int', nullable: true })
  actualPrimerQuantity!: number | null;

  @Column({ name: 'actual_fuze_quantity', type: 'int', nullable: true })
  actualFuzeQuantity!: number | null;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'accepted_at', type: 'timestamp', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'final_edit_until', type: 'timestamp', nullable: true })
  finalEditUntil!: Date | null;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt!: Date | null;

  @Column({ name: 'completion_comment', type: 'text', nullable: true })
  completionComment!: string | null;

  canExecute?: boolean;

  canControl?: boolean;
}
