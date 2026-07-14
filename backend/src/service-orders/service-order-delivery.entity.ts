import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { Unit } from '../units/unit.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { ServiceOrder } from './service-order.entity';

export type ServiceOrderDeliveryLevel = 'division' | 'battery';
export type ServiceOrderDeliveryStatus = 'new' | 'viewed' | 'accepted' | 'rejected';

@Entity('service_order_deliveries')
@Unique('uq_service_order_delivery_recipient', [
  'serviceOrderId',
  'recipientUnitId',
  'recipientLevel',
])
export class ServiceOrderDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_order_id', type: 'uuid' })
  serviceOrderId!: string;

  @ManyToOne(() => ServiceOrder, (order) => order.deliveries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'service_order_id' })
  serviceOrder!: ServiceOrder;

  @Column({ name: 'recipient_unit_id', type: 'uuid' })
  recipientUnitId!: string;

  @ManyToOne(() => Unit)
  @JoinColumn({ name: 'recipient_unit_id' })
  recipientUnit!: Unit;

  @Column({ name: 'recipient_level', type: 'varchar', length: 20 })
  recipientLevel!: ServiceOrderDeliveryLevel;

  @Column({ type: 'varchar', length: 20, default: 'new' })
  status!: ServiceOrderDeliveryStatus;

  @Column({ name: 'delivered_at', type: 'timestamptz' })
  deliveredAt!: Date;

  @Column({ name: 'viewed_at', type: 'timestamptz', nullable: true })
  viewedAt!: Date | null;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @Column({ name: 'responded_by_user_id', type: 'uuid', nullable: true })
  respondedByUserId!: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'estimated_ready_at', type: 'timestamptz', nullable: true })
  estimatedReadyAt!: Date | null;

  @Column({ name: 'selected_fire_position_id', type: 'uuid', nullable: true })
  selectedFirePositionId!: string | null;

  @ManyToOne(() => FirePosition, { nullable: true })
  @JoinColumn({ name: 'selected_fire_position_id' })
  selectedFirePosition!: FirePosition | null;

  @Column({ name: 'selected_weapon_system_id', type: 'uuid', nullable: true })
  selectedWeaponSystemId!: string | null;

  @ManyToOne(() => WeaponSystem, { nullable: true })
  @JoinColumn({ name: 'selected_weapon_system_id' })
  selectedWeaponSystem!: WeaponSystem | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
