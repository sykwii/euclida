import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Depot } from '../depots/depot.entity';
import { FireMission } from '../fire-missions/fire-mission.entity';

@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'from_depot_id', type: 'uuid', nullable: true })
  fromDepotId!: string | null;

  @ManyToOne(() => Depot, { nullable: true })
  @JoinColumn({ name: 'from_depot_id' })
  fromDepot!: Depot | null;

  @Column({ name: 'to_depot_id', type: 'uuid', nullable: true })
  toDepotId!: string | null;

  @ManyToOne(() => Depot, { nullable: true })
  @JoinColumn({ name: 'to_depot_id' })
  toDepot!: Depot | null;

  @Column({ name: 'item_type', type: 'varchar', length: 50 })
  itemType!: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  quantity!: number;

  @CreateDateColumn({ name: 'movement_datetime' })
  movementDatetime!: Date;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'movement_type', type: 'varchar', length: 50, default: 'transfer' })
movementType!: string;

@Column({ name: 'fire_mission_id', type: 'uuid', nullable: true })
fireMissionId!: string | null;

@ManyToOne(() => FireMission, { nullable: true })
@JoinColumn({ name: 'fire_mission_id' })
fireMission!: FireMission | null;

@Column({ name: 'movement_group_id', type: 'uuid', nullable: true })
movementGroupId!: string | null;

@Column({ name: 'document_number', type: 'varchar', length: 50, nullable: true })
documentNumber!: string | null;

}