import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type OperationalNotificationType =
  | 'new_target'
  | 'weapon_not_ready'
  | 'weapon_ready'
  | 'fire_position_not_ready'
  | 'fire_position_ready'
  | 'target_accepted'
  | 'target_rejected'
  | 'firing_blocked';

export type OperationalNotificationSeverity = 'critical' | 'attention' | 'info';

@Entity('operational_notifications')
@Index('idx_operational_notifications_unit_read', ['recipientUnitId', 'readAt'])
@Index('idx_operational_notifications_user_read', ['recipientUserId', 'readAt'])
@Index('idx_operational_notifications_type_created', ['type', 'createdAt'])
@Index('uq_operational_notifications_source_event_key', ['sourceEventKey'], {
  unique: true,
})
export class OperationalNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recipient_user_id', type: 'uuid', nullable: true })
  recipientUserId!: string | null;

  @Column({ name: 'recipient_unit_id', type: 'uuid', nullable: true })
  recipientUnitId!: string | null;

  @Column({ name: 'recipient_level', type: 'varchar', length: 30, nullable: true })
  recipientLevel!: string | null;

  @Column({ type: 'varchar', length: 60 })
  type!: OperationalNotificationType;

  @Column({ type: 'varchar', length: 30 })
  severity!: OperationalNotificationSeverity;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 80 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ name: 'action_url', type: 'varchar', length: 500, nullable: true })
  actionUrl!: string | null;

  @Column({ name: 'source_event_key', type: 'varchar', length: 255 })
  sourceEventKey!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'acknowledged_at', type: 'timestamp', nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;
}
