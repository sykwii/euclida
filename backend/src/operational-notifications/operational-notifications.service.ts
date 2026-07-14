import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { ServiceOrderDelivery } from '../service-orders/service-order-delivery.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import {
  OperationalNotification,
  OperationalNotificationSeverity,
  OperationalNotificationType,
} from './operational-notification.entity';

interface NotificationDraft {
  recipientUserId?: string | null;
  recipientUnitId?: string | null;
  recipientLevel?: string | null;
  type: OperationalNotificationType;
  severity: OperationalNotificationSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  actionUrl?: string | null;
  sourceEventKey: string;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
}

@Injectable()
export class OperationalNotificationsService implements OnModuleInit {
  constructor(
    @InjectRepository(OperationalNotification)
    private readonly repository: Repository<OperationalNotification>,
    private readonly accessScope: AccessScopeService,
    private readonly realtimeEvents: RealtimeEventsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS operational_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_user_id UUID NULL,
        recipient_unit_id UUID NULL,
        recipient_level VARCHAR(30) NULL,
        type VARCHAR(60) NOT NULL,
        severity VARCHAR(30) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        entity_type VARCHAR(80) NOT NULL,
        entity_id UUID NOT NULL,
        action_url VARCHAR(500) NULL,
        source_event_key VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        read_at TIMESTAMP NULL,
        acknowledged_at TIMESTAMP NULL,
        actor_user_id UUID NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_notifications_source_event_key
      ON operational_notifications(source_event_key)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_operational_notifications_unit_read
      ON operational_notifications(recipient_unit_id, read_at)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_operational_notifications_user_read
      ON operational_notifications(recipient_user_id, read_at)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_operational_notifications_type_created
      ON operational_notifications(type, created_at DESC)
    `);
  }

  async findAll(user: AuthUser, unreadOnly = false): Promise<OperationalNotification[]> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    const query = this.repository
      .createQueryBuilder('notification')
      .orderBy('notification.createdAt', 'DESC')
      .take(100);

    this.applyScopeFilter(query, user, allowedUnitIds);

    if (unreadOnly) {
      query.andWhere('notification.readAt IS NULL');
    }

    return query.getMany();
  }

  async countUnread(user: AuthUser): Promise<{ unread: number; critical: number }> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    const query = this.repository
      .createQueryBuilder('notification')
      .where('notification.readAt IS NULL');

    this.applyScopeFilter(query, user, allowedUnitIds);

    const rows = await query.getMany();

    return {
      unread: rows.length,
      critical: rows.filter((item) => item.severity === 'critical').length,
    };
  }

  async findOneForUser(id: string, user: AuthUser): Promise<OperationalNotification> {
    const item = await this.repository.findOne({ where: { id } });

    if (!item) {
      throw new NotFoundException('Повідомлення не знайдено');
    }

    await this.ensureCanAccessNotification(item, user);
    return item;
  }

  async markRead(id: string, user: AuthUser): Promise<OperationalNotification> {
    const item = await this.findOneForUser(id, user);

    if (!item.readAt) {
      item.readAt = new Date();
      await this.repository.save(item);
      this.emitNotificationChanged(item);
    }

    return item;
  }

  async acknowledge(id: string, user: AuthUser): Promise<OperationalNotification> {
    const item = await this.findOneForUser(id, user);
    const now = new Date();

    item.readAt = item.readAt ?? now;
    item.acknowledgedAt = item.acknowledgedAt ?? now;
    await this.repository.save(item);
    this.emitNotificationChanged(item);
    return item;
  }

  async markAllRead(user: AuthUser): Promise<{ updated: number }> {
    const items = await this.findAll(user, true);
    const now = new Date();

    items.forEach((item) => {
      item.readAt = item.readAt ?? now;
    });

    if (items.length > 0) {
      await this.repository.save(items);
      this.realtimeEvents.emitMany(['events'], 'updated', {
        entity: 'operational_notification',
        reason: 'notifications_read_all',
      });
    }

    return { updated: items.length };
  }

  async createForDeliveries(orderId: string, actorUserId: string | null): Promise<void> {
    const deliveries = await this.dataSource.getRepository(ServiceOrderDelivery).find({
      where: { serviceOrderId: orderId },
      relations: {
        serviceOrder: true,
        recipientUnit: true,
      },
    });

    for (const delivery of deliveries) {
      await this.createOnce({
        recipientUnitId: delivery.recipientUnitId,
        recipientLevel: delivery.recipientLevel,
        type: 'new_target',
        severity: 'attention',
        title: 'Нова ціль',
        message: `Надійшла ВГЗ ${delivery.serviceOrder?.orderNumber ?? delivery.serviceOrderId}`,
        entityType: 'service_order_delivery',
        entityId: delivery.id,
        actionUrl: `/notifications?deliveryId=${delivery.id}`,
        sourceEventKey: `service-order-delivery:${delivery.id}:new-target:${delivery.recipientUnitId}`,
        actorUserId,
        payload: {
          serviceOrderId: delivery.serviceOrderId,
          orderNumber: delivery.serviceOrder?.orderNumber ?? null,
          recipientLevel: delivery.recipientLevel,
          recipientUnitName: delivery.recipientUnit?.name ?? null,
        },
      });
    }
  }

  async notifyWeaponReadinessTransition(
    previousStatus: string | null | undefined,
    weaponId: string,
    actorUserId: string | null,
  ): Promise<void> {
    const weapon = await this.dataSource.getRepository(WeaponSystem).findOne({
      where: { id: weaponId },
      relations: {
        currentFirePosition: true,
      },
    });

    if (!weapon || !weapon.unitId || previousStatus === weapon.readinessStatus) {
      return;
    }

    if (this.isReady(previousStatus) && this.isNotReady(weapon.readinessStatus)) {
      await this.createOnce({
        recipientUnitId: weapon.unitId,
        type: 'weapon_not_ready',
        severity: 'critical',
        title: 'СГ НЕ БГ',
        message: `${this.weaponName(weapon)} стала НЕ БГ${weapon.notReadyReason ? `: ${this.weaponReasonLabel(weapon.notReadyReason)}` : ''}`,
        entityType: 'weapon_system',
        entityId: weapon.id,
        actionUrl: `/weapon-systems?weaponId=${weapon.id}`,
        sourceEventKey: `weapon:${weapon.id}:not-ready:${weapon.updatedAt?.toISOString() ?? Date.now()}`,
        actorUserId,
        payload: {
          callsign: this.weaponName(weapon),
          reason: weapon.notReadyReason,
          firePositionId: weapon.currentFirePositionId,
          firePositionName: weapon.currentFirePosition?.name ?? null,
        },
      });
      return;
    }

    if (this.isNotReady(previousStatus) && this.isReady(weapon.readinessStatus)) {
      await this.createOnce({
        recipientUnitId: weapon.unitId,
        type: 'weapon_ready',
        severity: 'info',
        title: 'СГ БГ',
        message: `${this.weaponName(weapon)} підтверджена БГ`,
        entityType: 'weapon_system',
        entityId: weapon.id,
        actionUrl: `/weapon-systems?weaponId=${weapon.id}`,
        sourceEventKey: `weapon:${weapon.id}:ready:${weapon.updatedAt?.toISOString() ?? Date.now()}`,
        actorUserId,
        payload: {
          callsign: this.weaponName(weapon),
          firePositionId: weapon.currentFirePositionId,
          firePositionName: weapon.currentFirePosition?.name ?? null,
        },
      });
    }
  }

  async notifyFirePositionReadinessTransition(
    previousStatus: string | null | undefined,
    firePositionId: string,
    actorUserId: string | null,
  ): Promise<void> {
    const firePosition = await this.dataSource.getRepository(FirePosition).findOne({
      where: { id: firePositionId },
    });

    if (!firePosition || !firePosition.unitId || previousStatus === firePosition.readinessStatus) {
      return;
    }

    const assignedWeapon = await this.dataSource.getRepository(WeaponSystem).findOne({
      where: {
        currentFirePositionId: firePosition.id,
        deploymentStatus: 'at_fire_position',
      },
    });

    if (this.isReady(previousStatus) && this.isNotReady(firePosition.readinessStatus)) {
      await this.createOnce({
        recipientUnitId: firePosition.unitId,
        type: 'fire_position_not_ready',
        severity: 'critical',
        title: 'ВП НЕ БГ',
        message: `${firePosition.name} стала НЕ БГ${firePosition.notReadyReason ? `: ${this.firePositionReasonLabel(firePosition.notReadyReason)}` : ''}`,
        entityType: 'fire_position',
        entityId: firePosition.id,
        actionUrl: `/fire-positions?firePositionId=${firePosition.id}`,
        sourceEventKey: `fire-position:${firePosition.id}:not-ready:${firePosition.updatedAt?.toISOString() ?? Date.now()}`,
        actorUserId,
        payload: {
          firePositionName: firePosition.name,
          reason: firePosition.notReadyReason,
          assignedWeaponId: assignedWeapon?.id ?? null,
          assignedWeaponName: assignedWeapon ? this.weaponName(assignedWeapon) : null,
        },
      });
      return;
    }

    if (this.isNotReady(previousStatus) && this.isReady(firePosition.readinessStatus)) {
      await this.createOnce({
        recipientUnitId: firePosition.unitId,
        type: 'fire_position_ready',
        severity: 'info',
        title: 'ВП БГ',
        message: `${firePosition.name} підтверджена БГ`,
        entityType: 'fire_position',
        entityId: firePosition.id,
        actionUrl: `/fire-positions?firePositionId=${firePosition.id}`,
        sourceEventKey: `fire-position:${firePosition.id}:ready:${firePosition.updatedAt?.toISOString() ?? Date.now()}`,
        actorUserId,
        payload: {
          firePositionName: firePosition.name,
          assignedWeaponId: assignedWeapon?.id ?? null,
          assignedWeaponName: assignedWeapon ? this.weaponName(assignedWeapon) : null,
        },
      });
    }
  }

  private async createOnce(draft: NotificationDraft): Promise<OperationalNotification | null> {
    const existing = await this.repository.findOne({
      where: { sourceEventKey: draft.sourceEventKey },
    });

    if (existing) {
      return null;
    }

    const item = this.repository.create({
      recipientUserId: draft.recipientUserId ?? null,
      recipientUnitId: draft.recipientUnitId ?? null,
      recipientLevel: draft.recipientLevel ?? null,
      type: draft.type,
      severity: draft.severity,
      title: draft.title,
      message: draft.message,
      entityType: draft.entityType,
      entityId: draft.entityId,
      actionUrl: draft.actionUrl ?? null,
      sourceEventKey: draft.sourceEventKey,
      actorUserId: draft.actorUserId ?? null,
      payload: draft.payload ?? {},
    });

    try {
      const saved = await this.repository.save(item);
      this.emitNotificationCreated(saved);
      return saved;
    } catch {
      return null;
    }
  }

  private applyScopeFilter(
    query: ReturnType<Repository<OperationalNotification>['createQueryBuilder']>,
    user: AuthUser,
    allowedUnitIds: string[] | null,
  ): void {
    if (allowedUnitIds === null) {
      return;
    }

    const units = allowedUnitIds.length > 0 ? allowedUnitIds : ['00000000-0000-4000-8000-000000000000'];
    query.andWhere(
      '(notification.recipientUserId = :userId OR notification.recipientUnitId IN (:...unitIds))',
      { userId: user.sub, unitIds: units },
    );
  }

  private async ensureCanAccessNotification(
    item: OperationalNotification,
    user: AuthUser,
  ): Promise<void> {
    if (item.recipientUserId === user.sub) {
      return;
    }

    if (user.role === 'admin' || user.scope === 'main') {
      return;
    }

    if (await this.accessScope.canAccessUnit(user, item.recipientUnitId)) {
      return;
    }

    throw new ForbiddenException('Немає доступу до повідомлення');
  }

  private emitNotificationCreated(item: OperationalNotification): void {
    this.realtimeEvents.emitMany(['events'], 'created', {
      entity: 'operational_notification',
      id: item.id,
      unitId: item.recipientUnitId ?? undefined,
      reason: item.type,
    });
  }

  private emitNotificationChanged(item: OperationalNotification): void {
    this.realtimeEvents.emitMany(['events'], 'updated', {
      entity: 'operational_notification',
      id: item.id,
      unitId: item.recipientUnitId ?? undefined,
      reason: 'notification_state',
    });
  }

  private isReady(value: string | null | undefined): boolean {
    return value === 'combat_ready' || value === 'ready';
  }

  private isNotReady(value: string | null | undefined): boolean {
    return value === 'not_combat_ready' || value === 'not_ready';
  }

  private weaponName(weapon: Pick<WeaponSystem, 'callsign' | 'serialNumber' | 'id'>): string {
    return weapon.callsign || weapon.serialNumber || `СГ ${weapon.id.slice(0, 8)}`;
  }

  private weaponReasonLabel(value: string): string {
    const labels: Record<string, string> = {
      breakdown: 'поломка',
      threat: 'загроза',
      crew: 'екіпаж',
      maintenance: 'ТО/ремонт',
      other: 'інше',
    };

    return labels[value] ?? value;
  }

  private firePositionReasonLabel(value: string): string {
    const labels: Record<string, string> = {
      threat: 'загроза',
      damaged: 'пошкоджена',
      not_prepared: 'не підготовлена',
      occupied: 'зайнята',
      other: 'інше',
    };

    return labels[value] ?? value;
  }
}
