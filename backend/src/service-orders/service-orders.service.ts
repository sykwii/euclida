import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { Charge } from '../charges/charge.entity';
import {
  latLngToMgrs,
  mgrsToLatLng,
  normalizeMgrs,
} from '../common/geo/mgrs.util';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { EventLogsService } from '../event-logs/event-logs.service';
import { ExecutionRecord } from '../execution/execution-record.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { Fuze } from '../fuzes/fuze.entity';
import { Primer } from '../primers/primer.entity';
import { CompleteServiceOrderDto } from './dto/complete-service-order.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { RespondServiceOrderDeliveryDto } from './dto/respond-service-order-delivery.dto';
import { SendServiceOrderDto } from './dto/send-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import {
  ServiceOrderDelivery,
  ServiceOrderDeliveryLevel,
  ServiceOrderDeliveryStatus,
} from './service-order-delivery.entity';
import { ServiceOrder } from './service-order.entity';
import { ServiceOrderActualAmmo } from './service-order-actual-ammo.entity';
import { ServiceOrderActualShotConfigurationCharge } from './service-order-actual-shot-configuration-charge.entity';
import { ServiceOrderActualShotConfiguration } from './service-order-actual-shot-configuration.entity';
import { ServiceOrderSuggestionsService } from './service-order-suggestions.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { OperationalNotificationsService } from '../operational-notifications/operational-notifications.service';
import { ShellCompatibleCharge } from '../shell-compatible-charges/shell-compatible-charge.entity';
import { ShotConfiguration } from '../shot-configurations/shot-configuration.entity';
import { StockMovement } from '../stock-movements/stock-movement.entity';
import { Unit } from '../units/unit.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { getActiveMaintenance } from '../weapon-systems/weapon-maintenance-state';

export interface ServiceOrderMapResult {
  id: string;
  orderNumber: string;
  targetLat: number;
  targetLng: number;
  targetMgrs: string | null;
  targetSettlement: string | null;
  taskType: string;
  resultType: string | null;
  resultComment: string | null;
  completedAt: Date | null;
  plannedQuantity: number;
  actualQuantity: number | null;
  firePositionName: string | null;
  unitName: string | null;
  shellMarking: string | null;
  chargeMarking: string | null;
  zoneName: string | null;
}

interface ResolvedShotConfigurationComponent {
  chargeId: string;
  charge: Charge;
  quantityPerShot: number;
  sortOrder: number;
  accountingUnit: 'piece' | 'module';
}

interface ResolvedShotConfiguration {
  id: string | null;
  name: string;
  weaponModelId: string | null;
  shellId: string;
  shellMarking: string;
  fuzeId: string | null;
  fuzeMarking: string | null;
  primerId: string | null;
  primerMarking: string | null;
  zoneId: string | null;
  zoneNumber: number | null;
  maxRangeM: number;
  charges: ResolvedShotConfigurationComponent[];
}

interface ServiceOrderDeliveryRecipient {
  recipientUnitId: string;
  recipientLevel: ServiceOrderDeliveryLevel;
  selectedFirePositionId: string | null;
}

@Injectable()
export class ServiceOrdersService {
  private readonly logger = new Logger(ServiceOrdersService.name);

  constructor(
    @InjectRepository(ServiceOrder)
    private readonly repository: Repository<ServiceOrder>,
    @InjectRepository(ExecutionRecord)
    private readonly executionRecordsRepository: Repository<ExecutionRecord>,
    private readonly suggestionsService: ServiceOrderSuggestionsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly accessScope: AccessScopeService,
    private readonly eventLogs: EventLogsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly operationalNotifications?: OperationalNotificationsService,
  ) {}

  async findAll(user: AuthUser): Promise<ServiceOrder[]> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return [];
    }

    const items = await this.repository.find({
      relations: {
        selectedFirePosition: {
          unit: true,
        },
        selectedShell: true,
        selectedCharge: true,
        selectedZone: true,
        selectedShotConfiguration: {
          shell: true,
          fuze: true,
          primer: true,
          charges: {
            charge: true,
          },
        },
        selectedAirAssetPosition: {
          unit: true,
        },
        selectedDroneModel: true,
        selectedWarheadType: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const visible: ServiceOrder[] = [];

    for (const item of items) {
      if (await this.canViewOrder(item, user)) {
        visible.push(item);
      }
    }

    return visible;
  }

  async countActionable(user: AuthUser): Promise<number> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return 0;
    }

    const statuses =
      user.role === 'admin' || user.scope === 'main'
        ? ['draft', 'proposed', 'rejected']
        : ['sent', 'accepted', 'rejected', 'in_progress'];

    const query = this.repository
      .createQueryBuilder('order')
      .leftJoin('order.selectedFirePosition', 'firePosition')
      .where('order.status IN (:...statuses)', { statuses });

    if (allowedUnitIds !== null) {
      query.andWhere(
        '(order.assignedUnitId IN (:...allowedUnitIds) OR firePosition.unitId IN (:...allowedUnitIds))',
        { allowedUnitIds },
      );
    }

    return query.getCount();
  }

  async findOne(id: string, user?: AuthUser): Promise<ServiceOrder> {
    const item = await this.repository.findOne({
      where: { id },
      relations: {
        selectedFirePosition: {
          unit: true,
        },
        selectedShell: true,
        selectedCharge: true,
        selectedZone: true,
        selectedShotConfiguration: {
          shell: true,
          fuze: true,
          primer: true,
          charges: {
            charge: true,
          },
        },
        selectedAirAssetPosition: {
          unit: true,
        },
        selectedDroneModel: true,
        selectedWarheadType: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Завдання не знайдено');
    }

    if (user) {
      await this.ensureCanViewOrder(item, user);
    }

    return item;
  }

  async findDeliveries(user: AuthUser): Promise<ServiceOrderDelivery[]> {
    const query = this.dataSource
      .getRepository(ServiceOrderDelivery)
      .createQueryBuilder('delivery')
      .leftJoinAndSelect('delivery.serviceOrder', 'serviceOrder')
      .leftJoinAndSelect('serviceOrder.selectedFirePosition', 'selectedFirePosition')
      .leftJoinAndSelect('selectedFirePosition.unit', 'firePositionUnit')
      .leftJoinAndSelect('serviceOrder.selectedShotConfiguration', 'selectedShotConfiguration')
      .leftJoinAndSelect('selectedShotConfiguration.shell', 'selectedShotShell')
      .leftJoinAndSelect('selectedShotConfiguration.fuze', 'selectedShotFuze')
      .leftJoinAndSelect('selectedShotConfiguration.primer', 'selectedShotPrimer')
      .leftJoinAndSelect('selectedShotConfiguration.charges', 'selectedShotCharges')
      .leftJoinAndSelect('selectedShotCharges.charge', 'selectedShotCharge')
      .leftJoinAndSelect('delivery.recipientUnit', 'recipientUnit')
      .leftJoinAndSelect('delivery.selectedFirePosition', 'deliveryFirePosition')
      .leftJoinAndSelect('delivery.selectedWeaponSystem', 'deliveryWeaponSystem')
      .orderBy('delivery.deliveredAt', 'DESC');

    if (user.role !== 'admin' && user.scope !== 'main') {
      const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

      if (allowedUnitIds === null || allowedUnitIds.length === 0) {
        return [];
      }

      query.andWhere('delivery.recipientUnitId IN (:...allowedUnitIds)', {
        allowedUnitIds,
      });

      if (user.scope === 'battery') {
        query.andWhere('delivery.recipientLevel = :level', { level: 'battery' });
      } else if (user.scope === 'division') {
        query.andWhere('delivery.recipientLevel IN (:...levels)', {
          levels: ['division', 'battery'],
        });
      }
    }

    return query.getMany();
  }

  async findOrderDeliveries(
    orderId: string,
    user: AuthUser,
  ): Promise<ServiceOrderDelivery[]> {
    const order = await this.findOne(orderId, user);

    if (user.role !== 'admin' && user.scope !== 'main') {
      const canAccess = await this.accessScope.canAccessUnit(user, order.assignedUnitId);

      if (!canAccess) {
        throw new BadRequestException('Немає доступу до доставок цього ВГЗ');
      }
    }

    return this.dataSource.getRepository(ServiceOrderDelivery).find({
      where: { serviceOrderId: order.id },
      relations: {
        recipientUnit: true,
        selectedFirePosition: true,
        selectedWeaponSystem: true,
      },
      order: {
        recipientLevel: 'ASC',
        deliveredAt: 'ASC',
      },
    });
  }

  async countUnreadDeliveries(user: AuthUser): Promise<{ count: number }> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return { count: 0 };
    }

    const query = this.dataSource
      .getRepository(ServiceOrderDelivery)
      .createQueryBuilder('delivery')
      .where('delivery.status = :status', { status: 'new' });

    if (allowedUnitIds !== null) {
      query.andWhere('delivery.recipientUnitId IN (:...allowedUnitIds)', {
        allowedUnitIds,
      });
    }

    if (user.scope === 'battery') {
      query.andWhere('delivery.recipientLevel = :level', { level: 'battery' });
    }

    return { count: await query.getCount() };
  }

  async markDeliveryViewed(
    deliveryId: string,
    user: AuthUser,
  ): Promise<ServiceOrderDelivery> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const delivery = await this.findDeliveryForUpdate(manager, deliveryId);
      await this.ensureCanRespondToDelivery(delivery, user, true);

      if (delivery.status === 'new') {
        delivery.status = 'viewed';
        delivery.viewedAt = new Date();
        const updated = await manager.save(ServiceOrderDelivery, delivery);
        await this.writeDeliveryEvent(manager, updated, user);
        return updated;
      }

      return delivery;
    });

    this.notifyDeliveryRealtime(saved, 'updated');
    return this.getDeliveryWithRelations(saved.id);
  }

  async respondDelivery(
    deliveryId: string,
    body: RespondServiceOrderDeliveryDto,
    user: AuthUser,
  ): Promise<ServiceOrderDelivery> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const delivery = await this.findDeliveryForUpdate(manager, deliveryId);
      await this.ensureCanRespondToDelivery(delivery, user, false);

      const nextStatus = body.status;
      const rejectionReason = body.rejectionReason?.trim() ?? '';
      const comment = body.comment?.trim() ?? '';

      if (delivery.status === 'accepted' || delivery.status === 'rejected') {
        throw new BadRequestException('Доставка вже опрацьована');
      }

      if (nextStatus === 'rejected' && !rejectionReason) {
        throw new BadRequestException('Для відхилення потрібно вказати причину');
      }

      if (delivery.recipientLevel === 'division' && (body.selectedFirePositionId || body.selectedWeaponSystemId)) {
        throw new BadRequestException('Дивізіон не обирає фактичну ВП або гармату');
      }

      if (delivery.recipientLevel === 'battery') {
        await this.validateBatteryDeliverySelection(manager, delivery, body);
      }

      const estimatedReadyAt = body.estimatedReadyAt
        ? new Date(body.estimatedReadyAt)
        : null;

      if (estimatedReadyAt && Number.isNaN(estimatedReadyAt.getTime())) {
        throw new BadRequestException('Некоректний очікуваний час готовності');
      }

      delivery.status = nextStatus;
      delivery.viewedAt = delivery.viewedAt ?? new Date();
      delivery.respondedAt = new Date();
      delivery.respondedByUserId = user.sub;
      delivery.rejectionReason = nextStatus === 'rejected' ? rejectionReason : null;
      delivery.comment = comment || null;
      delivery.estimatedReadyAt = estimatedReadyAt;
      delivery.selectedFirePositionId =
        body.selectedFirePositionId ?? delivery.selectedFirePositionId;
      delivery.selectedWeaponSystemId =
        body.selectedWeaponSystemId ?? delivery.selectedWeaponSystemId;

      const updated = await manager.save(ServiceOrderDelivery, delivery);
      await this.writeDeliveryEvent(manager, updated, user);

      if (updated.recipientLevel === 'battery' && updated.status === 'accepted') {
        const order = await manager.findOne(ServiceOrder, {
          where: { id: updated.serviceOrderId },
          lock: { mode: 'pessimistic_write' },
        });

        if (order && ['sent', 'sent_to_battery', 'sent_to_division'].includes(order.status)) {
          order.status = 'accepted';
          order.acceptedByUserId = user.sub;
          order.rejectionReason = null;
          await manager.save(ServiceOrder, order);
        }
      }

      return updated;
    });

    this.notifyDeliveryRealtime(saved, 'updated');
    this.notifyRealtime(saved.serviceOrderId, 'updated', ['missions', 'events']);
    return this.getDeliveryWithRelations(saved.id);
  }

  async create(
    data: CreateServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    if (user.role === 'observer') {
      throw new BadRequestException('Спостерігач не може створювати заявки');
    }

    if (user.scope === 'ew') {
      throw new BadRequestException(
        'Оператор РЕБ може працювати з картою та повітряними загрозами, але не створює ВГЗ',
      );
    }

    let targetLat = data.targetLat;
    let targetLng = data.targetLng;
    let targetMgrs = data.targetMgrs;

    if (targetMgrs) {
      try {
        targetMgrs = normalizeMgrs(targetMgrs);
      } catch {
        throw new BadRequestException(
          'Некоректний MGRS. Формат: 36U XB 11111 22222',
        );
      }
    }

    if ((targetLat === undefined || targetLng === undefined) && targetMgrs) {
      const converted = mgrsToLatLng(targetMgrs);
      targetLat = converted.lat;
      targetLng = converted.lng;
    }

    if (targetLat === undefined || targetLng === undefined) {
      throw new BadRequestException('Потрібно вказати Lat/Lng або MGRS');
    }

    if (!targetMgrs) {
      targetMgrs = latLngToMgrs(targetLat, targetLng);
    }

    if (!data.orderNumber.trim()) {
      throw new BadRequestException('Вкажіть номер завдання');
    }

    const item = this.repository.create({
      ...data,
      targetLat,
      targetLng,
      targetMgrs,
      orderNumber: data.orderNumber.trim(),
      status: 'draft',
      plannedQuantity: data.plannedQuantity ?? 0,
      createdByUserId: user.sub,
    });

    const savedItem = await this.repository.save(item);

    await this.writeOrderEvent(savedItem, user, 'created', 'Створено заявку');

    this.notifyRealtime(savedItem, 'created');

    return savedItem;
  }

  async createFromReconPuar(
    proposal: {
      id: string;
      targetId: string | null;
      observationId: string | null;
      payload: Record<string, unknown>;
      comments?: string | null;
    },
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const source = (proposal.payload['target'] || proposal.payload['observation']) as
      | {
          lat?: number;
          lng?: number;
          mgrs?: string | null;
          targetType?: string;
        }
      | undefined;

    if (!source?.lat || !source?.lng) {
      throw new BadRequestException('У пропозиції ПУАР немає координат');
    }

    const orderNumber = `PUAR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${proposal.id.slice(0, 8)}`;
    const item = this.repository.create({
      orderNumber,
      status: 'draft',
      targetLat: Number(source.lat),
      targetLng: Number(source.lng),
      targetMgrs: source.mgrs || latLngToMgrs(Number(source.lat), Number(source.lng)),
      targetSettlement: proposal.comments || null,
      taskType: source.targetType || 'service',
      plannedQuantity: 1,
      createdByUserId: user.sub,
      reconSnapshot: proposal.payload,
      sourceReconTargetId: proposal.targetId,
      sourceReconObservationId: proposal.observationId,
      sourcePuarProposalId: proposal.id,
      reconSnapshotUpdatedAt: new Date(),
      reconLinkCheckedAt: new Date(),
    });

    const savedItem = await this.repository.save(item);
    await this.writeOrderEvent(savedItem, user, 'created', 'Створено чернетку ВГЗ з ПУАР');
    this.notifyRealtime(savedItem, 'created');
    this.realtimeEvents.emitMany(['missions', 'recon', 'events'], 'created', {
      entity: 'service_order',
      id: savedItem.id,
      reason: 'recon:core-puar-accepted',
    });
    return savedItem;
  }

  async update(
    id: string,
    data: UpdateServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const item = await this.findOne(id, user);

    await this.ensureCanChangeOrder(item, user);
    this.assertCanEdit(item);

    let targetLat =
      data.targetLat !== undefined ? data.targetLat : item.targetLat;

    let targetLng =
      data.targetLng !== undefined ? data.targetLng : item.targetLng;

    let targetMgrs =
      data.targetMgrs !== undefined ? data.targetMgrs : item.targetMgrs;

    if (data.targetMgrs) {
      try {
        targetMgrs = normalizeMgrs(data.targetMgrs);
      } catch {
        throw new BadRequestException(
          'Некоректний MGRS. Формат: 36U XB 11111 22222',
        );
      }
    }

    if (
      (data.targetLat === undefined || data.targetLng === undefined) &&
      targetMgrs
    ) {
      const converted = mgrsToLatLng(targetMgrs);
      targetLat = converted.lat;
      targetLng = converted.lng;
    }

    if (targetLat === undefined || targetLng === undefined) {
      throw new BadRequestException('Потрібно вказати Lat/Lng або MGRS');
    }

    if (!targetMgrs) {
      targetMgrs = latLngToMgrs(targetLat, targetLng);
    }

    Object.assign(item, {
      ...data,
      targetLat,
      targetLng,
      targetMgrs,
      plannedQuantity:
        data.plannedQuantity !== undefined
          ? data.plannedQuantity
          : item.plannedQuantity,
    });

    const savedItem = await this.repository.save(item);

    await this.writeOrderEvent(savedItem, user, 'updated', 'Оновлено заявку');

    this.notifyRealtime(savedItem, 'updated');

    return savedItem;
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const item = await this.findOne(id, user);

    if (item.status !== 'draft') {
      throw new BadRequestException('Видалити можна тільки чернетку');
    }

    if (user.role !== 'admin' && user.scope !== 'main') {
      throw new BadRequestException(
        'Видаляти чернетки може тільки ОКП або адміністратор',
      );
    }

    await this.repository.remove(item);

    await this.writeOrderEvent(item, user, 'deleted', 'Видалено чернетку');

    this.notifyRealtime(item, 'deleted');
  }

  async getSuggestions(id: string, user: AuthUser) {
    const order = await this.findOne(id, user);

    if (order.status !== 'draft' && order.status !== 'proposed') {
      throw new BadRequestException(
        'Підбір точок доступний тільки для чернетки або пропозиції',
      );
    }

    if (user.role !== 'admin' && user.scope !== 'main') {
      throw new BadRequestException(
        'Підбір ВП виконує головний оператор або адміністратор',
      );
    }

    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    return this.suggestionsService.getSuggestions(order, allowedUnitIds);
  }

  async selectPosition(
    id: string,
    body: {
      firePositionId: string;
      weaponSystemId: string;
      shotConfigurationId?: string;
      shellId?: string;
      chargeId?: string;
    },
    user: AuthUser,
  ) {
    const order = await this.findOne(id, user);

    if (user.role !== 'admin' && user.scope !== 'main') {
      throw new BadRequestException(
        'Обирати ВП для заявки може тільки ОКП або адміністратор',
      );
    }

    if (!['draft', 'proposed', 'rejected'].includes(order.status)) {
      throw new BadRequestException('Вибір виконавця можливий тільки для чернетки, пропозиції або відхиленої заявки');
    }

    if (!body.shotConfigurationId) {
      throw new BadRequestException('Потрібно обрати комплект пострілу');
    }

    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    const suggestions = await this.suggestionsService.getSuggestions(
      order,
      allowedUnitIds,
    );
    const selectedCandidate = suggestions.find(
      (candidate) =>
        candidate.candidateType === 'fire_position' &&
        candidate.firePositionId === body.firePositionId &&
        candidate.weaponSystemId === body.weaponSystemId,
    );
    if (!selectedCandidate) {
      throw new BadRequestException(
        'Обраний виконавець відсутній серед дозволених кандидатів',
      );
    }
    if (!selectedCandidate.ready) {
      throw new BadRequestException(
        selectedCandidate.rejectionReasonLabels?.join('; ') ||
          'Обраний виконавець не готовий',
      );
    }
    if (
      !selectedCandidate.compatibleKits?.some(
        (kit) => kit.shotConfigurationId === body.shotConfigurationId,
      )
    ) {
      throw new BadRequestException(
        'Комплект пострілу несумісний з обраним виконавцем',
      );
    }

    const firePosition = await this.dataSource.getRepository(FirePosition).findOne({
      where: { id: body.firePositionId },
    });

    if (!firePosition) {
      throw new BadRequestException('Вогневу позицію не знайдено');
    }

    if (!body.weaponSystemId) {
      throw new BadRequestException('Немає БГ СГ');
    }

    const selectedWeapon = await this.dataSource.getRepository(WeaponSystem).findOne({
      where: {
        id: body.weaponSystemId,
        currentFirePositionId: firePosition.id,
        deploymentStatus: 'at_fire_position',
      },
    });

    if (
      !selectedWeapon ||
      selectedWeapon.readinessStatus !== 'combat_ready'
    ) {
      throw new BadRequestException('Немає БГ СГ');
    }

    const selectedConfiguration = await this.dataSource.transaction((manager) =>
      this.resolveShotConfigurationForSelection(manager, firePosition, order, body),
    );

    order.executorType = 'fire_position';
    order.selectedFirePositionId = body.firePositionId;
    order.selectedShotConfigurationId = selectedConfiguration.id;
    order.selectedShellId = selectedConfiguration.shellId;
    order.selectedChargeId = selectedConfiguration.charges[0]?.chargeId ?? null;
    order.selectedZoneId = selectedConfiguration.zoneId;
    order.selectedAirAssetPositionId = null;
    order.selectedDroneModelId = null;
    order.selectedWarheadTypeId = null;
    order.linkedAirTaskId = null;
    order.assignedUnitId = null;
    order.assignedScope = null;
    order.sentByUserId = null;
    order.acceptedByUserId = null;
    order.rejectionReason = null;
    order.rejectedByUnitName = null;
    order.rejectedAt = null;
    order.status = 'proposed';

    const savedOrder = await this.repository.save(order);

    await this.writeOrderEvent(
      savedOrder,
      user,
      'updated',
      'Обрано ВП для заявки',
    );

    this.notifyRealtime(savedOrder, 'updated');

    return this.findOne(savedOrder.id, user);
  }

  async sendToUnit(
    id: string,
    _body: SendServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const item = await this.findOne(id, user);

    if (user.role !== 'admin' && user.scope !== 'main') {
      throw new BadRequestException(
        'Надсилати заявку виконавцю може тільки головний оператор або адміністратор',
      );
    }

    if (
      item.status === 'sent' ||
      item.status === 'sent_to_division' ||
      item.status === 'sent_to_battery'
    ) {
      return item;
    }

    if (item.status !== 'proposed') {
      throw new BadRequestException(
        'Надіслати можна тільки заявку, для якої вже обрано виконавця',
      );
    }

    if (item.executorType === 'air_asset_position') {
      if (!item.selectedAirAssetPositionId || !item.selectedAirAssetPosition?.unitId) {
        throw new BadRequestException('Підрозділ не визначено');
      }

      item.assignedScope = 'battery';
      item.assignedUnitId = item.selectedAirAssetPosition.unitId;
    } else {
      if (!item.selectedFirePositionId || !item.selectedFirePosition?.unitId) {
        throw new BadRequestException('Підрозділ не визначено');
      }

      item.assignedScope = 'battery';
      item.assignedUnitId = item.selectedFirePosition.unitId;
    }

    item.sentByUserId = user.sub;
    item.status = 'sent';

    const saved = await this.dataSource.transaction(async (manager) => {
      const savedOrder = await manager.save(ServiceOrder, item);
      await this.createDeliveriesForOrder(manager, savedOrder);
      return savedOrder;
    });

    await this.writeOrderEvent(
      saved,
      user,
      'sent',
      item.executorType === 'air_asset_position'
        ? `Заявку передано виконавцю ${item.selectedAirAssetPosition?.callsign || item.selectedAirAssetPosition?.name || ''}. Оператор підрозділу виконавця отримує її автоматично`
        : `Заявку передано на ПУВБ за ВП ${item.selectedFirePosition?.name || ''}. Оператор підрозділу виконавця отримує її автоматично`,
    );

    this.notifyRealtime(saved, 'sent');
    await this.notifyOrderDeliveriesCreated(saved.id);
    await this.operationalNotifications?.createForDeliveries(saved.id, user.sub);

    return saved;
  }
  async accept(id: string, user: AuthUser): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);

    await this.ensureCanExecuteOrder(order, user);

    if (order.status === 'accepted') {
      throw new BadRequestException('ВГЗ вже прийнято іншим оператором');
    }

    if (
      order.status !== 'sent_to_division' &&
      order.status !== 'sent_to_battery' &&
      order.status !== 'sent'
    ) {
      throw new BadRequestException('Прийняти можна тільки передану заявку');
    }

    order.status = 'accepted';
    order.acceptedByUserId = user.sub;
    order.rejectionReason = null;

    const savedOrder = await this.repository.save(order);

    await this.writeOrderEvent(savedOrder, user, 'accepted', 'Заявку прийнято');

    this.notifyRealtime(savedOrder, 'accepted');

    return savedOrder;
  }

  async reject(
    id: string,
    reason: string,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);

    await this.ensureCanExecuteOrder(order, user);

    if (
      order.status !== 'sent_to_division' &&
      order.status !== 'sent_to_battery' &&
      order.status !== 'sent' &&
      order.status !== 'accepted'
    ) {
      throw new BadRequestException('Відхилити можна тільки передану заявку');
    }

    if (!reason.trim()) {
      throw new BadRequestException('Потрібно вказати причину відхилення');
    }

    order.status = 'rejected';
    order.rejectionReason = reason.trim();
    order.rejectedByUnitName = order.selectedFirePosition?.unit?.name ?? null;
    order.rejectedAt = new Date();

    const savedOrder = await this.repository.save(order);

    await this.writeOrderEvent(
      savedOrder,
      user,
      'rejected',
      'Заявку відхилено',
    );

    this.notifyRealtime(savedOrder, 'rejected');

    return savedOrder;
  }

  async reopenRejected(id: string, user: AuthUser): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);

    if (user.role !== 'admin' && user.scope !== 'main') {
      throw new BadRequestException(
        'Повторний підбір може виконати тільки ОКП або адміністратор',
      );
    }

    if (order.status !== 'rejected') {
      throw new BadRequestException(
        'Повторний підбір доступний тільки для відхиленого завдання',
      );
    }

    order.status = 'draft';
    order.assignedUnitId = null;
    order.assignedScope = null;
    order.sentByUserId = null;
    order.acceptedByUserId = null;
    order.completedByUserId = null;
    order.selectedFirePositionId = null;
    order.selectedShellId = null;
    order.selectedChargeId = null;
    order.selectedZoneId = null;
    order.selectedShotConfigurationId = null;
    order.executorType = null;
order.selectedAirAssetPositionId = null;
order.selectedDroneModelId = null;
order.selectedWarheadTypeId = null;
order.linkedAirTaskId = null;
    order.rejectionReason = null;
    order.rejectedByUnitName = null;
    order.rejectedAt = null;

    const savedOrder = await this.repository.save(order);
    await this.writeOrderEvent(
      savedOrder,
      user,
      'reopened',
      'Заявку повернуто на повторний підбір',
    );
    this.notifyRealtime(savedOrder, 'updated');
    return savedOrder;
  }

async selectAirAsset(
  id: string,
  body: {
    airAssetPositionId: string;
    droneModelId: string;
    warheadTypeId: string;
  },
  user: AuthUser,
): Promise<ServiceOrder> {
  const order = await this.findOne(id, user);

  if (user.role !== 'admin' && user.scope !== 'main') {
    throw new BadRequestException(
      'Обирати бойовий БпЛА для заявки може тільки ОКП або адміністратор',
    );
  }

  if (!['draft', 'proposed', 'rejected'].includes(order.status)) {
      throw new BadRequestException('Вибір виконавця можливий тільки для чернетки, пропозиції або відхиленої заявки');
    }

  order.executorType = 'air_asset_position';

  order.assignedUnitId = null;
  order.assignedScope = null;
  order.sentByUserId = null;
  order.acceptedByUserId = null;
  order.rejectionReason = null;
  order.rejectedByUnitName = null;
  order.rejectedAt = null;

  order.selectedFirePositionId = null;
  order.selectedShellId = null;
  order.selectedChargeId = null;
  order.selectedZoneId = null;
  order.selectedShotConfigurationId = null;

  order.selectedAirAssetPositionId = body.airAssetPositionId;
  order.selectedDroneModelId = body.droneModelId;
  order.selectedWarheadTypeId = body.warheadTypeId;
  order.linkedAirTaskId = null;

  order.status = 'proposed';

  const savedOrder = await this.repository.save(order);

  await this.writeOrderEvent(
    savedOrder,
    user,
    'updated',
    'Обрано бойовий БпЛА для заявки',
  );

  this.notifyRealtime(savedOrder, 'updated');

  return this.findOne(savedOrder.id, user);
}


  async start(id: string, user: AuthUser): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);

    await this.ensureCanExecuteOrder(order, user);

    if (order.status !== 'accepted') {
      throw new BadRequestException('Почати можна тільки прийняте завдання');
    }

    if (order.executorType === 'air_asset_position') {
      if (!order.selectedAirAssetPositionId) {
        throw new BadRequestException('Неможливо почати завдання без обраного виконавця');
      }
    } else if (!order.selectedFirePositionId) {
      throw new BadRequestException('Неможливо почати завдання без обраного виконавця');
    }

    if (order.executorType !== 'air_asset_position') {
      await this.ensureWeaponReadyForFirePositionExecution(order.selectedFirePositionId!);
    }

    await this.ensureBatteryDeliveryAccepted(order);

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      order.status = 'in_progress';
      order.startedAt = new Date();

      return manager.save(ServiceOrder, order);
    });

    await this.writeOrderEvent(savedOrder, user, 'started', 'Заявку розпочато');

    this.notifyRealtime(savedOrder, 'started');

    return savedOrder;
  }
  async complete(
    id: string,
    body: CompleteServiceOrderDto,
  user: AuthUser,
  ): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);
    const executionRecords = await this.executionRecordsRepository.find({
      where: { serviceOrderId: id },
      relations: {
        artillery: {
          charges: true,
        },
      },
      order: {
        createdAt: 'ASC',
      },
    });

    if (executionRecords.length === 0) {
      throw new BadRequestException(
        'Завершення доступне тільки після створення, перевірки та проведення запису журналу виконання.',
      );
    }

    return this.completeFromExecutionJournal(order, executionRecords, body, user);
  }

  private async completeFromExecutionJournal(
    order: ServiceOrder,
    executionRecords: ExecutionRecord[],
    body: CompleteServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    await this.ensureCanExecuteOrder(order, user);

    const isFirstCompletion = order.status === 'in_progress';
    const isEditingCompleted = order.status === 'completed';

    if (!isFirstCompletion && !isEditingCompleted) {
      throw new BadRequestException(
        'Завершити або редагувати можна тільки завдання в роботі чи завершене завдання',
      );
    }

    if (isEditingCompleted) {
      this.assertCanEdit(order);
    }

    if (!order.selectedFirePositionId) {
      throw new BadRequestException(
        'Неможливо завершити завдання без обраної ВП',
      );
    }

    const startedAt = new Date(body.startedAt);
    const completedAt = new Date(body.completedAt);

    if (
      Number.isNaN(startedAt.getTime()) ||
      Number.isNaN(completedAt.getTime())
    ) {
      throw new BadRequestException('Некоректна дата початку або завершення');
    }

    if (completedAt < startedAt) {
      throw new BadRequestException(
        'Дата завершення не може бути раніше дати початку',
      );
    }

    const activeExecutionRecords = executionRecords.filter(
      (item) => item.status !== 'reversed' && item.status !== 'cancelled',
    );
    const postedExecutionRecords = activeExecutionRecords.filter(
      (item) => item.status === 'posted',
    );
    const activeDraftRecords = activeExecutionRecords.filter(
      (item) => item.status === 'draft',
    );

    if (postedExecutionRecords.length === 0) {
      throw new BadRequestException(
        'Неможливо завершити ВГЗ без хоча б одного проведеного запису журналу виконання',
      );
    }

    if (activeDraftRecords.length > 0) {
      throw new BadRequestException('Є непроведене виконання');
    }

    const actualQuantity = this.roundStockQuantity(
      postedExecutionRecords.reduce(
        (sum, item) => sum + Number(item.quantity ?? 0),
        0,
      ),
    );
    const plannedQuantity = Number(order.plannedQuantity ?? 0);
    const deviationSummary = this.buildExecutionDeviationSummary(
      plannedQuantity,
      actualQuantity,
      postedExecutionRecords,
    );

    if (actualQuantity < plannedQuantity && !body.resultComment?.trim()) {
      throw new BadRequestException(
        'Фактична кількість менша за планову. Потрібен коментар результату',
      );
    }

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      const lockedOrder = await manager.findOne(ServiceOrder, {
        where: { id: order.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedOrder) {
        throw new NotFoundException('Вогневе завдання не знайдено');
      }

      await this.ensureCanExecuteOrder(lockedOrder, user);

      const firstCompletion = lockedOrder.status === 'in_progress';
      const editingCompleted = lockedOrder.status === 'completed';

      if (!firstCompletion && !editingCompleted) {
        throw new BadRequestException(
          'Завершити або редагувати можна тільки завдання в роботі чи завершене завдання',
        );
      }

      if (editingCompleted) {
        this.assertCanEdit(lockedOrder);
      }

      const currentExecutionRecords = await manager.find(ExecutionRecord, {
        where: { serviceOrderId: lockedOrder.id },
        relations: {
          artillery: {
            charges: true,
          },
        },
        order: {
          createdAt: 'ASC',
        },
      });
      const currentActiveRecords = currentExecutionRecords.filter(
        (item) => item.status !== 'reversed' && item.status !== 'cancelled',
      );
      const currentPostedRecords = currentActiveRecords.filter(
        (item) => item.status === 'posted',
      );

      if (currentPostedRecords.length === 0) {
        throw new BadRequestException(
          'Неможливо завершити ВГЗ без хоча б одного проведеного запису журналу виконання',
        );
      }
      if (currentActiveRecords.some((item) => item.status === 'draft')) {
        throw new BadRequestException('Є непроведене виконання');
      }

      const currentActualQuantity = this.roundStockQuantity(
        currentPostedRecords.reduce(
          (sum, item) => sum + Number(item.quantity ?? 0),
          0,
        ),
      );
      const currentDeviationSummary = this.buildExecutionDeviationSummary(
        Number(lockedOrder.plannedQuantity ?? 0),
        currentActualQuantity,
        currentPostedRecords,
      );

      const firePosition = await manager.findOne(FirePosition, {
        where: { id: lockedOrder.selectedFirePositionId! },
        lock: { mode: 'pessimistic_write' },
      });

      if (!firePosition) {
        throw new BadRequestException('Вогневу позицію не знайдено');
      }

      lockedOrder.status = 'completed';
      lockedOrder.startedAt = startedAt;
      lockedOrder.completedAt = completedAt;
      lockedOrder.actualQuantity = currentActualQuantity;
      lockedOrder.resultType = body.resultType;
      lockedOrder.resultComment = [
        body.resultComment?.trim(),
        currentDeviationSummary,
      ]
        .filter(Boolean)
        .join('\n') || null;
      lockedOrder.completedByUserId = user.sub;

      const saved = await manager.save(ServiceOrder, lockedOrder);

      if (firstCompletion) {
        firePosition.completedVgzCount =
          Number(firePosition.completedVgzCount ?? 0) + 1;
        await manager.save(FirePosition, firePosition);
      }

      return saved;
    });

    await this.writeOrderEvent(
      savedOrder,
      user,
      'completed',
      'Заявку завершено',
    );

    this.notifyRealtime(savedOrder, 'completed', [
      'missions',
      'map',
      'analytics',
      'events',
    ]);

    return savedOrder;
  }

  private async completeCanonical(
    id: string,
    body: CompleteServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const startedAt = new Date(body.startedAt);
    const completedAt = new Date(body.completedAt);
    const shotQuantity = Number(body.actualQuantity);

    if (
      Number.isNaN(startedAt.getTime()) ||
      Number.isNaN(completedAt.getTime())
    ) {
      throw new BadRequestException('Некоректна дата початку або завершення');
    }

    if (completedAt < startedAt) {
      throw new BadRequestException(
        'Дата завершення не може бути раніше дати початку',
      );
    }

    if (!Number.isInteger(shotQuantity) || shotQuantity <= 0) {
      throw new BadRequestException(
        'Фактична кількість пострілів має бути цілим додатним числом',
      );
    }

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(ServiceOrder, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException('Вогневе завдання не знайдено');
      }

      await this.ensureCanExecuteOrder(order, user);

      const isFirstCompletion = order.status === 'in_progress';
      const isEditingCompleted = order.status === 'completed';

      if (!isFirstCompletion && !isEditingCompleted) {
        throw new BadRequestException(
          'Завершити або редагувати можна тільки завдання в роботі чи завершене завдання',
        );
      }

      if (isEditingCompleted) {
        this.assertCanEdit(order);
      }

      if (!order.selectedFirePositionId) {
        throw new BadRequestException(
          'Неможливо завершити завдання без обраної ВП',
        );
      }

      const firePosition = await manager.findOne(FirePosition, {
        where: { id: order.selectedFirePositionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!firePosition?.ammoDepotId) {
        throw new BadRequestException('У вибраної ВП немає локального БК');
      }

      const configuration = await this.resolveShotConfigurationForCompletion(
        manager,
        firePosition,
        order,
        body,
      );

      if (
        !configuration.id ||
        !configuration.fuzeId ||
        !configuration.primerId ||
        configuration.zoneNumber === null ||
        configuration.charges.length === 0
      ) {
        throw new BadRequestException(
          'Активний комплект пострілу повинен містити снаряд, підривник, капсуль, зону та щонайменше один заряд',
        );
      }

      const configurationEntity = await manager.findOne(ShotConfiguration, {
        where: { id: configuration.id },
      });

      if (!configurationEntity?.isActive) {
        throw new BadRequestException('Комплект пострілу неактивний');
      }

      const shellAdjustments = new Map<string, number>();
      const chargeAdjustments = new Map<string, number>();
      const fuzeAdjustments = new Map<string, number>();
      const primerAdjustments = new Map<string, number>();

      if (isEditingCompleted) {
        await this.restorePreviousCompletionState(
          manager,
          order,
          shellAdjustments,
          chargeAdjustments,
          fuzeAdjustments,
          primerAdjustments,
        );

        await manager.delete(StockMovement, {
          documentNumber: `VGZ-${order.id.slice(0, 8)}`,
          movementType: 'write_off',
        });
      }

      this.addStockAdjustment(
        shellAdjustments,
        configuration.shellId,
        -shotQuantity,
      );
      this.addStockAdjustment(
        fuzeAdjustments,
        configuration.fuzeId,
        -shotQuantity,
      );
      this.addStockAdjustment(
        primerAdjustments,
        configuration.primerId,
        -shotQuantity,
      );

      for (const component of configuration.charges) {
        this.addStockAdjustment(
          chargeAdjustments,
          component.chargeId,
          -(shotQuantity * component.quantityPerShot),
        );
      }

      await this.applyShellStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        shellAdjustments,
      );
      await this.applyChargeStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        chargeAdjustments,
      );
      await this.applyFuzeStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        fuzeAdjustments,
      );
      await this.applyPrimerStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        primerAdjustments,
      );

      await manager.delete(ServiceOrderActualAmmo, { serviceOrderId: order.id });

      await this.saveActualShotConfigurationSnapshot(
        manager,
        order.id,
        configuration,
      );

      await this.writeShotConfigurationStockMovements(
        manager,
        firePosition.ammoDepotId,
        order.id,
        shotQuantity,
        configuration,
      );

      const totalChargeQuantity = configuration.charges.reduce(
        (sum, component) =>
          this.roundStockQuantity(
            sum + shotQuantity * component.quantityPerShot,
          ),
        0,
      );

      order.status = 'completed';
      order.startedAt = startedAt;
      order.completedAt = completedAt;
      order.actualQuantity = shotQuantity;
      order.actualChargeQuantity = totalChargeQuantity;
      order.actualChargeModulesPerShot = null;
      order.selectedShotConfigurationId = configuration.id;
      order.selectedShellId = configuration.shellId;
      order.selectedChargeId = configuration.charges[0]?.chargeId ?? null;
      order.selectedZoneId = configuration.zoneId;
      order.actualShotConfigurationSnapshot =
        this.buildShotConfigurationSnapshot(configuration);
      order.resultType = body.resultType;
      order.resultComment = body.resultComment?.trim() || null;
      order.completedByUserId = user.sub;

      const saved = await manager.save(ServiceOrder, order);

      if (isFirstCompletion) {
        firePosition.completedVgzCount =
          Number(firePosition.completedVgzCount ?? 0) + 1;
        await manager.save(FirePosition, firePosition);
      }

      return saved;
    });

    await this.writeOrderEvent(
      savedOrder,
      user,
      'completed',
      'Заявку завершено',
    );

    this.notifyRealtime(savedOrder, 'completed', [
      'missions',
      'map',
      'stock',
      'analytics',
      'events',
    ]);

    return savedOrder;
  }
  private async completeLegacy(
    id: string,
    body: CompleteServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);

    await this.ensureCanExecuteOrder(order, user);

    const isFirstCompletion = order.status === 'in_progress';
    const isEditingCompleted = order.status === 'completed';

    if (!isFirstCompletion && !isEditingCompleted) {
      throw new BadRequestException(
        'Завершити або редагувати можна тільки завдання в роботі чи завершене завдання',
      );
    }

    if (isEditingCompleted) {
      this.assertCanEdit(order);
    }

    if (!order.selectedFirePositionId) {
      throw new BadRequestException(
        'Неможливо завершити завдання без обраної ВП',
      );
    }

    const startedAt = new Date(body.startedAt);
    const completedAt = new Date(body.completedAt);

    if (
      Number.isNaN(startedAt.getTime()) ||
      Number.isNaN(completedAt.getTime())
    ) {
      throw new BadRequestException('Некоректна дата початку або завершення');
    }

    if (completedAt < startedAt) {
      throw new BadRequestException(
        'Дата завершення не може бути раніше дати початку',
      );
    }

    const legacyActualQuantity = Number(body.actualQuantity);
    const requestedActualAmmo = body.actualAmmoItems?.length
      ? body.actualAmmoItems.map((item) => ({
          shellId: item.shellId,
          chargeId: item.chargeId,
          quantity: Number(item.quantity),
          chargeModulesPerShot: item.chargeModulesPerShot,
        }))
      : [
          {
            shellId: body.actualShellId ?? order.selectedShellId,
            chargeId: body.actualChargeId ?? order.selectedChargeId,
            quantity: legacyActualQuantity,
            chargeModulesPerShot: body.chargeModulesPerShot,
          },
        ];

    if (
      requestedActualAmmo.length === 0 ||
      requestedActualAmmo.some(
        (item) =>
          !item.shellId ||
          !item.chargeId ||
          item.quantity <= 0 ||
          !Number.isInteger(item.quantity),
      )
    ) {
      throw new BadRequestException(
        'Неможливо завершити завдання без фактичного снаряда та заряду',
      );
    }

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      const firePosition = await manager.findOne(FirePosition, {
        where: { id: order.selectedFirePositionId! },
      });

      if (!firePosition?.ammoDepotId) {
        throw new BadRequestException('У вибраної ВП немає локального БК');
      }

      const shellAdjustments = new Map<string, number>();
      const chargeAdjustments = new Map<string, number>();
      const actualAmmoRows: Array<Partial<ServiceOrderActualAmmo>> = [];

      if (isEditingCompleted) {
        const previousAmmo = await manager.find(ServiceOrderActualAmmo, {
          where: { serviceOrderId: order.id },
        });

        if (previousAmmo.length > 0) {
          for (const item of previousAmmo) {
            this.addStockAdjustment(shellAdjustments, item.shellId, Number(item.shotQuantity ?? 0));
            this.addStockAdjustment(chargeAdjustments, item.chargeId, Number(item.chargeQuantity ?? 0));
          }
        } else {
          this.addStockAdjustment(
            shellAdjustments,
            order.selectedShellId,
            Number(order.actualQuantity ?? 0),
          );
          this.addStockAdjustment(
            chargeAdjustments,
            order.selectedChargeId,
            Number(order.actualChargeQuantity ?? order.actualQuantity ?? 0),
          );
        }

        await manager.delete(ServiceOrderActualAmmo, { serviceOrderId: order.id });
      }

      for (const item of requestedActualAmmo) {
        const compatiblePair = await manager.findOne(ShellCompatibleCharge, {
          where: {
            shellId: item.shellId!,
            chargeId: item.chargeId!,
          },
        });

        if (!compatiblePair) {
          throw new BadRequestException(
            'Фактичний снаряд і заряд не мають налаштованої сумісності',
          );
        }

        const actualCharge = await manager.findOne(Charge, {
          where: { id: item.chargeId! },
        });

        if (!actualCharge) {
          throw new BadRequestException(
            'Фактичний заряд не знайдено в довіднику',
          );
        }

        const chargeUsage = this.calculateActualChargeUsage(
          actualCharge,
          item.quantity,
          item.chargeModulesPerShot,
          compatiblePair.usableModules,
        );

        this.addStockAdjustment(shellAdjustments, item.shellId, -item.quantity);
        this.addStockAdjustment(chargeAdjustments, item.chargeId, -chargeUsage.actualChargeQuantity);
        actualAmmoRows.push({
          serviceOrderId: order.id,
          shellId: item.shellId!,
          chargeId: item.chargeId!,
          shotQuantity: item.quantity,
          chargeQuantity: chargeUsage.actualChargeQuantity,
          chargeModulesPerShot: chargeUsage.modulesPerShot,
        });
      }

      await this.applyShellStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        shellAdjustments,
      );
      await this.applyChargeStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        chargeAdjustments,
      );

      if (isFirstCompletion) {
        await this.writeCompletionStockMovements(
          manager,
          firePosition.ammoDepotId,
          order.id,
          actualAmmoRows,
        );
      }

      const totalShotQuantity = requestedActualAmmo.reduce((sum, item) => sum + item.quantity, 0);
      const totalChargeQuantity = actualAmmoRows.reduce(
        (sum, item) => this.roundStockQuantity(sum + Number(item.chargeQuantity ?? 0)),
        0,
      );
      const firstAmmo = actualAmmoRows[0];
      const sameModules = actualAmmoRows.every(
        (item) => item.chargeModulesPerShot === firstAmmo.chargeModulesPerShot,
      );

      order.status = 'completed';
      order.startedAt = startedAt;
      order.completedAt = completedAt;
      order.actualQuantity = totalShotQuantity;
      order.actualChargeQuantity = totalChargeQuantity;
      order.actualChargeModulesPerShot = sameModules ? firstAmmo.chargeModulesPerShot ?? null : null;
      order.selectedShellId = firstAmmo.shellId!;
      order.selectedChargeId = firstAmmo.chargeId!;
      order.resultType = body.resultType;
      order.resultComment = body.resultComment?.trim() || null;
      order.completedByUserId = user.sub;

      const saved = await manager.save(ServiceOrder, order);
      await manager.save(
        ServiceOrderActualAmmo,
        actualAmmoRows.map((item) => ({ ...item, serviceOrderId: saved.id })),
      );

      if (isFirstCompletion) {
        firePosition.completedVgzCount =
          Number(firePosition.completedVgzCount ?? 0) + 1;

        await manager.save(FirePosition, firePosition);
      }

      return saved;
    });

    await this.writeOrderEvent(
      savedOrder,
      user,
      'completed',
      'Заявку завершено',
    );

    this.notifyRealtime(savedOrder, 'completed', [
      'missions',
      'map',
      'stock',
      'analytics',
      'events',
    ]);

    return savedOrder;
  }

  private async resolveShotConfigurationForSelection(
    manager: EntityManager,
    firePosition: FirePosition,
    order: ServiceOrder,
    body: {
      weaponSystemId: string;
      shotConfigurationId?: string;
      shellId?: string;
      chargeId?: string;
    },
  ): Promise<ResolvedShotConfiguration> {
    const distanceM = Math.ceil(
      this.getDistanceM(
        firePosition.lat,
        firePosition.lng,
        order.targetLat,
        order.targetLng,
      ),
    );

    if (!body.shotConfigurationId) {
      throw new BadRequestException('Потрібно обрати комплект пострілу');
    }

    const weapon = await manager.findOne(WeaponSystem, {
      where: {
        id: body.weaponSystemId,
        currentFirePositionId: firePosition.id,
        deploymentStatus: 'at_fire_position',
      },
    });
    if (!weapon || weapon.readinessStatus !== 'combat_ready') {
      throw new BadRequestException('Немає БГ СГ');
    }

    const configuration = await manager.findOne(ShotConfiguration, {
      where: { id: body.shotConfigurationId },
      relations: {
        shell: true,
        fuze: true,
        primer: true,
        charges: { charge: true },
      },
      order: { charges: { sortOrder: 'ASC' } },
    });
    if (!configuration || !configuration.isActive) {
      throw new BadRequestException('Комплект пострілу не знайдено');
    }
    if (configuration.weaponModelId !== weapon.weaponModelId) {
      throw new BadRequestException(
        'Комплект пострілу не належить до моделі обраної СГ',
      );
    }
    if (
      !configuration.shellId ||
      !configuration.fuzeId ||
      !configuration.primerId ||
      configuration.charges.length === 0
    ) {
      throw new BadRequestException('Комплект пострілу неповний');
    }
    if (distanceM > Number(configuration.maxRangeM)) {
      throw new BadRequestException(
        'Комплект пострілу не покриває дальність до цілі',
      );
    }
    return this.mapShotConfiguration(configuration);
  }

  private async resolveShotConfigurationForCompletion(
    manager: EntityManager,
    firePosition: FirePosition,
    order: ServiceOrder,
    body: CompleteServiceOrderDto,
  ): Promise<ResolvedShotConfiguration> {
    const distanceM = Math.ceil(
      this.getDistanceM(
        firePosition.lat,
        firePosition.lng,
        order.targetLat,
        order.targetLng,
      ),
    );

    return this.resolveShotConfiguration(manager, firePosition, {
      shotConfigurationId:
        body.actualShotConfigurationId ?? order.selectedShotConfigurationId ?? undefined,
      shellId: body.actualShellId ?? order.selectedShellId ?? undefined,
      chargeId: body.actualChargeId ?? order.selectedChargeId ?? undefined,
      zoneId: order.selectedZoneId,
      distanceM,
    });
  }

  private async resolveShotConfiguration(
    manager: EntityManager,
    firePosition: FirePosition,
    criteria: {
      shotConfigurationId?: string;
      shellId?: string;
      chargeId?: string;
      zoneId?: string | null;
      weaponSystemId?: string;
      distanceM: number;
    },
  ): Promise<ResolvedShotConfiguration> {
    const weaponSystems = await manager.find(WeaponSystem, {
      where: [
        {
          ...(criteria.weaponSystemId ? { id: criteria.weaponSystemId } : {}),
          currentFirePositionId: firePosition.id,
          deploymentStatus: 'at_fire_position',
        },
        {
          ...(criteria.weaponSystemId ? { id: criteria.weaponSystemId } : {}),
          firePositionId: firePosition.id,
          locationType: 'fire_position',
        },
      ],
    });

    const weaponModelIds = new Set(
      weaponSystems.map((item) => item.weaponModelId).filter(Boolean),
    );

    if (weaponModelIds.size === 0) {
      throw new BadRequestException('Для ВП не налаштовано модель озброєння');
    }

    let configuration: ShotConfiguration | null = null;

    if (criteria.shotConfigurationId) {
      configuration = await manager.findOne(ShotConfiguration, {
        where: { id: criteria.shotConfigurationId },
        relations: {
          shell: true,
          fuze: true,
          primer: true,
          charges: {
            charge: true,
          },
        },
        order: {
          charges: {
            sortOrder: 'ASC',
          },
        },
      });

      if (!configuration) {
        throw new BadRequestException('Комплект пострілу не знайдено');
      }
    } else if (criteria.shellId && criteria.chargeId) {
      const matches = await manager
        .getRepository(ShotConfiguration)
        .createQueryBuilder('configuration')
        .leftJoinAndSelect('configuration.shell', 'shell')
        .leftJoinAndSelect('configuration.fuze', 'fuze')
        .leftJoinAndSelect('configuration.primer', 'primer')
        .leftJoinAndSelect('configuration.charges', 'charges')
        .leftJoinAndSelect('charges.charge', 'charge')
        .where('configuration.shellId = :shellId', { shellId: criteria.shellId })
        .andWhere('charges.chargeId = :chargeId', { chargeId: criteria.chargeId })
        .andWhere(
          criteria.zoneId === undefined
            ? '1=1'
            : 'configuration.zoneId IS NOT DISTINCT FROM :zoneId',
          { zoneId: criteria.zoneId ?? null },
        )
        .orderBy('charges.sortOrder', 'ASC')
        .getMany();

      if (matches.length === 0) {
        throw new BadRequestException(
          'Не знайдено комплект пострілу для переданих legacy полів',
        );
      }

      if (matches.length > 1) {
        throw new BadRequestException(
          'Legacy комбінація shell/charge/zone неоднозначна. Оберіть комплект пострілу явно',
        );
      }

      configuration = matches[0];
    }

    if (!configuration) {
      throw new BadRequestException('Потрібно обрати комплект пострілу');
    }

    if (!weaponModelIds.has(configuration.weaponModelId)) {
      throw new BadRequestException(
        'Комплект пострілу не належить до моделі озброєння обраної ВП',
      );
    }

    if (criteria.distanceM > Number(configuration.maxRangeM)) {
      throw new BadRequestException(
        'Комплект пострілу не покриває дальність до цілі',
      );
    }

    if (!configuration.charges.length) {
      throw new BadRequestException('Комплект пострілу не містить жодного компонента заряду');
    }

    return this.mapShotConfiguration(configuration);
  }

  private mapShotConfiguration(configuration: ShotConfiguration): ResolvedShotConfiguration {
    return {
      id: configuration.id,
      name: configuration.name,
      weaponModelId: configuration.weaponModelId,
      shellId: configuration.shellId,
      shellMarking: configuration.shell.marking,
      fuzeId: configuration.fuzeId,
      fuzeMarking: configuration.fuze?.marking ?? null,
      primerId: configuration.primerId,
      primerMarking: configuration.primer?.marking ?? null,
      zoneId: configuration.zoneId,
      zoneNumber: configuration.zoneNumber ?? null,
      maxRangeM: Number(configuration.maxRangeM),
      charges: configuration.charges
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          chargeId: item.chargeId,
          charge: item.charge,
          quantityPerShot: Number(item.quantityPerShot),
          sortOrder: Number(item.sortOrder),
          accountingUnit: item.charge.chargeKind === 'modular' ? 'module' : 'piece',
        })),
    };
  }

  private buildShotConfigurationSnapshot(
    configuration: ResolvedShotConfiguration,
  ): Record<string, unknown> {
    return {
      id: configuration.id,
      name: configuration.name,
      weaponModelId: configuration.weaponModelId,
      shellId: configuration.shellId,
      shellMarking: configuration.shellMarking,
      fuzeId: configuration.fuzeId,
      fuzeMarking: configuration.fuzeMarking,
      primerId: configuration.primerId,
      primerMarking: configuration.primerMarking,
      zoneId: configuration.zoneId,
      zoneNumber: configuration.zoneNumber,
      maxRangeM: configuration.maxRangeM,
      charges: configuration.charges.map((item) => ({
        chargeId: item.chargeId,
        chargeMarking: item.charge.marking,
        accountingUnit: item.accountingUnit,
        quantityPerShot: item.quantityPerShot,
        sortOrder: item.sortOrder,
      })),
    };
  }

  private async saveActualShotConfigurationSnapshot(
    manager: EntityManager,
    serviceOrderId: string,
    configuration: ResolvedShotConfiguration,
  ): Promise<void> {
    await manager.delete(ServiceOrderActualShotConfiguration, { serviceOrderId });

    const snapshot = manager.create(ServiceOrderActualShotConfiguration, {
      serviceOrderId,
      shotConfigurationId: configuration.id,
      configurationName: configuration.name,
      weaponModelId: configuration.weaponModelId,
      shellId: configuration.shellId,
      shellMarking: configuration.shellMarking,
      fuzeId: configuration.fuzeId,
      fuzeMarking: configuration.fuzeMarking,
      primerId: configuration.primerId,
      primerMarking: configuration.primerMarking,
      zoneId: configuration.zoneId,
      zoneNumber: configuration.zoneNumber,
      maxRangeM: configuration.maxRangeM,
      snapshot: this.buildShotConfigurationSnapshot(configuration),
    });

    const savedSnapshot = await manager.save(ServiceOrderActualShotConfiguration, snapshot);
    await manager.save(
      ServiceOrderActualShotConfigurationCharge,
      configuration.charges.map((item) =>
        manager.create(ServiceOrderActualShotConfigurationCharge, {
          actualShotConfigurationId: savedSnapshot.id,
          chargeId: item.chargeId,
          chargeMarking: item.charge.marking,
          accountingUnit: item.accountingUnit,
          quantityPerShot: item.quantityPerShot,
          sortOrder: item.sortOrder,
        }),
      ),
    );
  }

  private async restorePreviousCompletionState(
    manager: EntityManager,
    order: ServiceOrder,
    shellAdjustments: Map<string, number>,
    chargeAdjustments: Map<string, number>,
    fuzeAdjustments: Map<string, number>,
    primerAdjustments: Map<string, number>,
  ): Promise<void> {
    const previousSnapshot = await manager.findOne(ServiceOrderActualShotConfiguration, {
      where: { serviceOrderId: order.id },
      relations: {
        charges: true,
      },
      order: {
        charges: {
          sortOrder: 'ASC',
        },
      },
    });

    if (previousSnapshot && order.actualQuantity) {
      this.addStockAdjustment(
        shellAdjustments,
        previousSnapshot.shellId,
        Number(order.actualQuantity),
      );

      if (previousSnapshot.fuzeId) {
        this.addStockAdjustment(
          fuzeAdjustments,
          previousSnapshot.fuzeId,
          Number(order.actualQuantity),
        );
      }

      if (previousSnapshot.primerId) {
        this.addStockAdjustment(
          primerAdjustments,
          previousSnapshot.primerId,
          Number(order.actualQuantity),
        );
      }

      for (const component of previousSnapshot.charges) {
        this.addStockAdjustment(
          chargeAdjustments,
          component.chargeId,
          Number(order.actualQuantity) * Number(component.quantityPerShot),
        );
      }

      await manager.delete(ServiceOrderActualShotConfiguration, {
        serviceOrderId: order.id,
      });
      return;
    }

    const previousAmmo = await manager.find(ServiceOrderActualAmmo, {
      where: { serviceOrderId: order.id },
    });

    if (previousAmmo.length > 0) {
      for (const item of previousAmmo) {
        this.addStockAdjustment(
          shellAdjustments,
          item.shellId,
          Number(item.shotQuantity ?? 0),
        );
        this.addStockAdjustment(
          chargeAdjustments,
          item.chargeId,
          Number(item.chargeQuantity ?? 0),
        );
      }
    } else {
      this.addStockAdjustment(
        shellAdjustments,
        order.selectedShellId,
        Number(order.actualQuantity ?? 0),
      );
      this.addStockAdjustment(
        chargeAdjustments,
        order.selectedChargeId,
        Number(order.actualChargeQuantity ?? order.actualQuantity ?? 0),
      );
    }

    await manager.delete(ServiceOrderActualAmmo, { serviceOrderId: order.id });
  }

  private calculateActualChargeUsage(
    charge: Charge,
    shotQuantity: number,
    requestedModulesPerShot?: number,
    compatibleUsableModules?: number | null,
  ): { actualChargeQuantity: number; modulesPerShot: number | null } {
    if (charge.chargeKind !== 'modular') {
      return {
        actualChargeQuantity: shotQuantity,
        modulesPerShot: null,
      };
    }

    const modulesPerCharge = Number(charge.modulesPerCharge ?? 0);

    if (!Number.isInteger(modulesPerCharge) || modulesPerCharge <= 0) {
      throw new BadRequestException(
        'Для модульного заряду не налаштована кількість модулів у повному заряді',
      );
    }

    const maxUsableModules = Number(
      compatibleUsableModules ?? charge.maxUsableModules ?? modulesPerCharge,
    );
    const modulesPerShot = Number(requestedModulesPerShot ?? maxUsableModules);

    if (
      !Number.isInteger(modulesPerShot) ||
      modulesPerShot <= 0 ||
      modulesPerShot > modulesPerCharge ||
      modulesPerShot > maxUsableModules
    ) {
      throw new BadRequestException(
        `Некоректна кількість модулів заряду. Доступно: 1-${Math.min(
          modulesPerCharge,
          maxUsableModules,
        )}`,
      );
    }

    return {
      actualChargeQuantity: this.roundStockQuantity(
        (shotQuantity * modulesPerShot) / modulesPerCharge,
      ),
      modulesPerShot,
    };
  }

  private addStockAdjustment(
    adjustments: Map<string, number>,
    itemId: string | null | undefined,
    delta: number,
  ): void {
    if (!itemId || delta === 0) return;
    adjustments.set(
      itemId,
      this.roundStockQuantity((adjustments.get(itemId) ?? 0) + delta),
    );
  }

  private async applyShellStockAdjustments(
    manager: EntityManager,
    depotId: string,
    adjustments: Map<string, number>,
  ): Promise<void> {
    for (const [shellId, delta] of adjustments) {
      if (delta === 0) continue;

      const stock = await manager.findOne(DepotShellStock, {
        where: { depotId, shellId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!stock) {
        throw new BadRequestException(
          'На локальному БК ВП немає фактичного снаряда',
        );
      }

      const nextQuantity = this.roundStockQuantity(
        Number(stock.quantity) + delta,
      );

      if (nextQuantity < 0) {
        throw new BadRequestException(
          `Недостатньо фактичних снарядів на локальному БК ВП. Потрібно додатково: ${this.roundStockQuantity(
            Math.abs(nextQuantity),
          )}`,
        );
      }

      stock.quantity = nextQuantity;
      await manager.save(DepotShellStock, stock);
    }
  }

  private async applyChargeStockAdjustments(
    manager: EntityManager,
    depotId: string,
    adjustments: Map<string, number>,
  ): Promise<void> {
    for (const [chargeId, delta] of adjustments) {
      if (delta === 0) continue;

      const stock = await manager.findOne(DepotChargeStock, {
        where: { depotId, chargeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!stock) {
        throw new BadRequestException(
          'На локальному БК ВП немає фактичного заряду',
        );
      }

      const nextQuantity = this.roundStockQuantity(
        Number(stock.quantity) + delta,
      );

      if (nextQuantity < 0) {
        throw new BadRequestException(
          `Недостатньо фактичних зарядів на локальному БК ВП. Потрібно додатково: ${this.roundStockQuantity(
            Math.abs(nextQuantity),
          )}`,
        );
      }

      stock.quantity = nextQuantity;
      await manager.save(DepotChargeStock, stock);
    }
  }

  private async applyFuzeStockAdjustments(
    manager: EntityManager,
    depotId: string,
    adjustments: Map<string, number>,
  ): Promise<void> {
    for (const [fuzeId, delta] of adjustments) {
      if (delta === 0) continue;

      const stock = await manager.findOne(DepotFuzeStock, {
        where: { depotId, fuzeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!stock) {
        throw new BadRequestException('На локальному БК ВП немає фактичного підривника');
      }

      const nextQuantity = Number(stock.quantity) + delta;
      if (nextQuantity < 0) {
        throw new BadRequestException('Недостатньо підривників на локальному БК ВП');
      }

      stock.quantity = nextQuantity;
      await manager.save(DepotFuzeStock, stock);
    }
  }

  private async applyPrimerStockAdjustments(
    manager: EntityManager,
    depotId: string,
    adjustments: Map<string, number>,
  ): Promise<void> {
    for (const [primerId, delta] of adjustments) {
      if (delta === 0) continue;

      const stock = await manager.findOne(DepotPrimerStock, {
        where: { depotId, primerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!stock) {
        throw new BadRequestException('На локальному БК ВП немає фактичного капсуля');
      }

      const nextQuantity = Number(stock.quantity) + delta;
      if (nextQuantity < 0) {
        throw new BadRequestException('Недостатньо капсулів на локальному БК ВП');
      }

      stock.quantity = nextQuantity;
      await manager.save(DepotPrimerStock, stock);
    }
  }

  private async writeCompletionStockMovements(
    manager: EntityManager,
    depotId: string,
    serviceOrderId: string,
    actualAmmoRows: Array<Partial<ServiceOrderActualAmmo>>,
  ): Promise<void> {
    const movementGroupId = randomUUID();
    const documentNumber = `VGZ-${serviceOrderId.slice(0, 8)}`;
    const movements: Array<Partial<StockMovement>> = [];

    for (const item of actualAmmoRows) {
      if (item.shellId && Number(item.shotQuantity ?? 0) > 0) {
        movements.push({
          fromDepotId: depotId,
          toDepotId: null,
          itemType: 'shell',
          itemId: item.shellId,
          quantity: Number(item.shotQuantity),
          movementType: 'write_off',
          movementGroupId,
          documentNumber,
          comment: `Списання за ВГЗ ${serviceOrderId}`,
        });
      }

      if (item.chargeId && Number(item.chargeQuantity ?? 0) > 0) {
        movements.push({
          fromDepotId: depotId,
          toDepotId: null,
          itemType: 'charge',
          itemId: item.chargeId,
          quantity: Number(item.chargeQuantity),
          movementType: 'write_off',
          movementGroupId,
          documentNumber,
          comment: `Списання за ВГЗ ${serviceOrderId}`,
        });
      }
    }

    if (movements.length > 0) {
      await manager.save(StockMovement, movements.map((item) => manager.create(StockMovement, item)));
    }
  }

  private async writeShotConfigurationStockMovements(
    manager: EntityManager,
    depotId: string,
    serviceOrderId: string,
    shotQuantity: number,
    configuration: ResolvedShotConfiguration,
  ): Promise<void> {
    const movementGroupId = randomUUID();
    const documentNumber = `VGZ-${serviceOrderId.slice(0, 8)}`;
    const movements: Array<Partial<StockMovement>> = [
      {
        fromDepotId: depotId,
        toDepotId: null,
        itemType: 'shell',
        itemId: configuration.shellId,
        quantity: shotQuantity,
        movementType: 'write_off',
        movementGroupId,
        documentNumber,
        comment: `Списання за ВГЗ ${serviceOrderId}`,
      },
    ];

    if (configuration.fuzeId) {
      movements.push({
        fromDepotId: depotId,
        toDepotId: null,
        itemType: 'fuze',
        itemId: configuration.fuzeId,
        quantity: shotQuantity,
        movementType: 'write_off',
        movementGroupId,
        documentNumber,
        comment: `Списання за ВГЗ ${serviceOrderId}`,
      });
    }

    if (configuration.primerId) {
      movements.push({
        fromDepotId: depotId,
        toDepotId: null,
        itemType: 'primer',
        itemId: configuration.primerId,
        quantity: shotQuantity,
        movementType: 'write_off',
        movementGroupId,
        documentNumber,
        comment: `Списання за ВГЗ ${serviceOrderId}`,
      });
    }

    for (const component of configuration.charges) {
      movements.push({
        fromDepotId: depotId,
        toDepotId: null,
        itemType: 'charge',
        itemId: component.chargeId,
        quantity: shotQuantity * component.quantityPerShot,
        movementType: 'write_off',
        movementGroupId,
        documentNumber,
        comment: `Списання за ВГЗ ${serviceOrderId}`,
      });
    }

    await manager.save(
      StockMovement,
      movements.map((item) => manager.create(StockMovement, item)),
    );
  }

  private getDistanceM(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const earthRadiusM = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  private roundStockQuantity(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
  }

  private async ensureWeaponReadyForFirePositionExecution(
    firePositionId: string,
  ): Promise<void> {
    const weapon = await this.dataSource.getRepository(WeaponSystem).findOne({
      where: [
        {
          currentFirePositionId: firePositionId,
          deploymentStatus: 'at_fire_position',
        },
        {
          firePositionId,
          locationType: 'fire_position',
        },
      ],
    });

    if (!weapon) {
      throw new BadRequestException('На ВП немає призначеної СГ');
    }

    if (weapon.deploymentStatus && weapon.deploymentStatus !== 'at_fire_position') {
      throw new BadRequestException('СГ не може виконувати завдання під час руху або з РЗ');
    }

    if (weapon.readinessStatus !== 'combat_ready' && weapon.readinessStatus !== 'ready') {
      throw new BadRequestException('СГ не перебуває у стані БГ');
    }

    if (await getActiveMaintenance(this.dataSource, weapon.id)) {
      throw new BadRequestException('Для СГ активне ТО або ремонт');
    }
  }

  async cancel(
    id: string,
    reason: string | undefined,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);

    await this.ensureCanChangeOrder(order, user);

    if (order.status === 'completed') {
      throw new BadRequestException('Завершене завдання не можна скасувати');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestException('Завдання вже скасоване');
    }

    order.status = 'cancelled';
    order.rejectionReason = reason?.trim() || 'Скасовано оператором';

    const savedOrder = await this.repository.save(order);

    await this.writeOrderEvent(
      savedOrder,
      user,
      'cancelled',
      'Заявку скасовано',
    );

    this.notifyRealtime(savedOrder, 'updated');

    return savedOrder;
  }

  async findMapResults(user: AuthUser): Promise<ServiceOrderMapResult[]> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return [];
    }

    const items = await this.repository.find({
      where:
        allowedUnitIds === null
          ? {
              status: 'completed',
            }
          : {
              status: 'completed',
              selectedFirePosition: {
                unitId: In(allowedUnitIds),
              },
            },
      relations: {
        selectedFirePosition: {
          unit: true,
        },
        selectedShell: true,
        selectedCharge: true,
        selectedZone: true,
        selectedAirAssetPosition: {
          unit: true,
        },
        selectedDroneModel: true,
        selectedWarheadType: true,
      },
      order: {
        completedAt: 'DESC',
      },
    });

    return items.map(
      (item): ServiceOrderMapResult => ({
        id: item.id,
        orderNumber: item.orderNumber,
        targetLat: item.targetLat,
        targetLng: item.targetLng,
        targetMgrs: item.targetMgrs,
        targetSettlement: item.targetSettlement,
        taskType: item.taskType,
        resultType: item.resultType,
        resultComment: item.resultComment,
        completedAt: item.completedAt,
        plannedQuantity: item.plannedQuantity,
        actualQuantity: item.actualQuantity,
        firePositionName: item.selectedFirePosition?.name ?? null,
        unitName: item.selectedFirePosition?.unit?.name ?? null,
        shellMarking: item.selectedShell?.marking ?? null,
        chargeMarking: item.selectedCharge?.marking ?? null,
        zoneName: item.selectedZone
          ? `Зона ${item.selectedZone.zoneNumber} (${item.selectedZone.distanceFromM}-${item.selectedZone.distanceToM} м)`
          : null,
      }),
    );
  }

  private assertCanEdit(item: ServiceOrder): void {
    if (item.status === 'cancelled') {
      throw new BadRequestException('Скасоване завдання не можна редагувати');
    }

    if (item.status === 'completed') {
      if (!item.completedAt) {
        throw new BadRequestException(
          'Завершене завдання має некоректну дату завершення',
        );
      }

      const completedAt = new Date(item.completedAt).getTime();
      const now = Date.now();
      const editWindowMs = 30 * 60 * 1000;

      if (now - completedAt > editWindowMs) {
        throw new BadRequestException(
          'Редагування завершеного завдання доступне тільки протягом 30 хвилин після завершення',
        );
      }
    }
  }

  private async createDeliveriesForOrder(
    manager: EntityManager,
    order: ServiceOrder,
  ): Promise<void> {
    const recipients = await this.resolveDeliveryRecipients(manager, order);

    if (recipients.length === 0) {
      throw new BadRequestException('Не вдалося визначити отримувачів доставки ВГЗ');
    }

    const values = recipients.map((recipient) => ({
      serviceOrderId: order.id,
      recipientUnitId: recipient.recipientUnitId,
      recipientLevel: recipient.recipientLevel,
      status: 'new' as ServiceOrderDeliveryStatus,
      deliveredAt: new Date(),
      selectedFirePositionId: recipient.selectedFirePositionId,
    }));

    await manager
      .createQueryBuilder()
      .insert()
      .into(ServiceOrderDelivery)
      .values(values)
      .orIgnore()
      .execute();
  }

  private async resolveDeliveryRecipients(
    manager: EntityManager,
    order: ServiceOrder,
  ): Promise<ServiceOrderDeliveryRecipient[]> {
    const batteryUnitId =
      order.selectedFirePosition?.unitId ??
      order.selectedAirAssetPosition?.unitId ??
      order.assignedUnitId;

    if (!batteryUnitId) {
      return [];
    }

    const batteryUnit = await manager.findOne(Unit, {
      where: { id: batteryUnitId },
      relations: { parent: true },
    });

    if (!batteryUnit) {
      return [];
    }

    const recipients: ServiceOrderDeliveryRecipient[] = [
      {
        recipientUnitId: batteryUnit.id,
        recipientLevel: 'battery',
        selectedFirePositionId: order.selectedFirePositionId,
      },
    ];

    const divisionUnit = await this.findDivisionForUnit(manager, batteryUnit);

    if (divisionUnit && divisionUnit.id !== batteryUnit.id) {
      recipients.unshift({
        recipientUnitId: divisionUnit.id,
        recipientLevel: 'division',
        selectedFirePositionId: order.selectedFirePositionId,
      });
    }

    return recipients;
  }

  private async findDivisionForUnit(
    manager: EntityManager,
    unit: Unit,
  ): Promise<Unit | null> {
    let current: Unit | null = unit;

    for (let depth = 0; depth < 6 && current; depth += 1) {
      if (current.type === 'division') {
        return current;
      }

      if (!current.parentId) {
        return null;
      }

      current = await manager.findOne(Unit, {
        where: { id: current.parentId },
        relations: { parent: true },
      });
    }

    return null;
  }

  private async ensureBatteryDeliveryAccepted(order: ServiceOrder): Promise<void> {
    const deliveryRepository = this.dataSource.getRepository(ServiceOrderDelivery);
    const deliveryCount = await deliveryRepository.count({
      where: { serviceOrderId: order.id },
    });

    if (deliveryCount === 0) {
      return;
    }

    const acceptedBatteryDelivery = await deliveryRepository.findOne({
      where: {
        serviceOrderId: order.id,
        recipientLevel: 'battery',
        status: 'accepted',
      },
    });

    if (!acceptedBatteryDelivery) {
      throw new BadRequestException(
        'Почати виконання можна тільки після прийняття доставки батареєю',
      );
    }
  }

  private async findDeliveryForUpdate(
    manager: EntityManager,
    deliveryId: string,
  ): Promise<ServiceOrderDelivery> {
    const lockedDelivery = await manager.findOne(ServiceOrderDelivery, {
      where: { id: deliveryId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!lockedDelivery) {
      throw new NotFoundException('Доставку ВГЗ не знайдено');
    }

    const delivery = await manager.findOne(ServiceOrderDelivery, {
      where: { id: lockedDelivery.id },
      relations: {
        serviceOrder: {
          selectedFirePosition: {
            unit: true,
          },
        },
        recipientUnit: true,
        selectedFirePosition: true,
        selectedWeaponSystem: true,
      },
    });

    if (!delivery) {
      throw new NotFoundException('Доставку ВГЗ не знайдено');
    }

    return delivery;
  }

  private async getDeliveryWithRelations(
    deliveryId: string,
  ): Promise<ServiceOrderDelivery> {
    const delivery = await this.dataSource.getRepository(ServiceOrderDelivery).findOne({
      where: { id: deliveryId },
      relations: {
        serviceOrder: {
          selectedFirePosition: {
            unit: true,
          },
          selectedShotConfiguration: {
            shell: true,
            fuze: true,
            primer: true,
            charges: {
              charge: true,
            },
          },
        },
        recipientUnit: true,
        selectedFirePosition: true,
        selectedWeaponSystem: true,
      },
    });

    if (!delivery) {
      throw new NotFoundException('Доставку ВГЗ не знайдено');
    }

    return delivery;
  }

  private async ensureCanRespondToDelivery(
    delivery: ServiceOrderDelivery,
    user: AuthUser,
    allowObserver: boolean,
  ): Promise<void> {
    if (!allowObserver && user.role === 'observer') {
      throw new BadRequestException('Спостерігач не може змінювати доставку ВГЗ');
    }

    if (user.role === 'admin') {
      return;
    }

    if (!user.unitId) {
      throw new BadRequestException('Для користувача не визначено підрозділ');
    }

    if (delivery.recipientLevel === 'battery') {
      if (user.scope !== 'battery' || delivery.recipientUnitId !== user.unitId) {
        throw new BadRequestException('Ця доставка належить іншій батареї');
      }
      return;
    }

    if (delivery.recipientLevel === 'division') {
      if (user.scope !== 'division' || delivery.recipientUnitId !== user.unitId) {
        throw new BadRequestException('Ця доставка належить іншому дивізіону');
      }
      return;
    }

    throw new BadRequestException('Невідомий рівень доставки ВГЗ');
  }

  private async validateBatteryDeliverySelection(
    manager: EntityManager,
    delivery: ServiceOrderDelivery,
    body: RespondServiceOrderDeliveryDto,
  ): Promise<void> {
    if (body.selectedFirePositionId) {
      const firePosition = await manager.findOne(FirePosition, {
        where: { id: body.selectedFirePositionId },
      });

      if (!firePosition) {
        throw new BadRequestException('Обрану ВП не знайдено');
      }

      if (firePosition.unitId !== delivery.recipientUnitId) {
        throw new BadRequestException('Обрана ВП не належить батареї доставки');
      }
    }

    if (body.selectedWeaponSystemId) {
      const weapon = await manager.findOne(WeaponSystem, {
        where: { id: body.selectedWeaponSystemId },
      });

      if (!weapon) {
        throw new BadRequestException('Обрану гармату не знайдено');
      }

      if (weapon.unitId !== delivery.recipientUnitId) {
        throw new BadRequestException('Обрана гармата не належить батареї доставки');
      }

      if (
        body.selectedFirePositionId &&
        weapon.currentFirePositionId &&
        weapon.currentFirePositionId !== body.selectedFirePositionId
      ) {
        throw new BadRequestException('Гармата розгорнута на іншій ВП');
      }
    }
  }

  private async writeDeliveryEvent(
    _manager: EntityManager,
    delivery: ServiceOrderDelivery,
    user: AuthUser,
  ): Promise<void> {
    const action = `delivery_${delivery.status}`;
    const levelLabel = delivery.recipientLevel === 'division' ? 'дивізіону' : 'батареї';
    const statusLabel: Record<ServiceOrderDeliveryStatus, string> = {
      new: 'створено',
      viewed: 'переглянуто',
      accepted: 'прийнято',
      rejected: 'відхилено',
    };

    try {
      await this.eventLogs.create({
        eventType: 'service_order',
        action,
        actor: user,
        unitId: delivery.recipientUnitId,
        unitName: delivery.recipientUnit?.name ?? null,
        entityType: 'service_order_delivery',
        entityId: delivery.id,
        entityName: delivery.serviceOrder?.orderNumber ?? delivery.serviceOrderId,
        title: `Доставку ВГЗ для ${levelLabel} ${statusLabel[delivery.status]}`,
        details: delivery.comment || delivery.rejectionReason || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to write service order delivery event ${delivery.id}: ${message}`);
    }
  }

  private notifyDeliveryRealtime(
    delivery: ServiceOrderDelivery,
    action: 'created' | 'updated',
  ): void {
    this.realtimeEvents.emitMany(['missions', 'events'], action, {
      entity: 'service_order_delivery',
      id: delivery.id,
      unitId: delivery.recipientUnitId,
    });
  }

  private async notifyOrderDeliveriesCreated(orderId: string): Promise<void> {
    const deliveries = await this.dataSource.getRepository(ServiceOrderDelivery).find({
      where: { serviceOrderId: orderId },
    });

    for (const delivery of deliveries) {
      this.notifyDeliveryRealtime(delivery, 'created');
    }
  }

  private async ensureCanViewOrder(
    order: ServiceOrder,
    user: AuthUser,
  ): Promise<void> {
    if (await this.canViewOrder(order, user)) {
      return;
    }

    throw new BadRequestException('Немає доступу до цієї заявки');
  }

  private async canViewOrder(
    order: ServiceOrder,
    user: AuthUser,
  ): Promise<boolean> {
    if (user.role === 'admin' || user.scope === 'main') {
      return true;
    }

    // Р”Рѕ РЅР°С‚РёСЃРєР°РЅРЅСЏ "РќР°РґС–СЃР»Р°С‚Рё РЅР° РџРЈР’Р‘" РјРѕР»РѕРґС€С– РїСѓРЅРєС‚Рё РЅРµ Р±Р°С‡Р°С‚СЊ Р·Р°СЏРІРєСѓ,
    // РЅР°РІС–С‚СЊ СЏРєС‰Рѕ РіРѕР»РѕРІРЅРёР№ РѕРїРµСЂР°С‚РѕСЂ СѓР¶Рµ РїС–РґС–Р±СЂР°РІ Р’Рџ.
    if (order.status === 'draft' || order.status === 'proposed') {
      return false;
    }

    if (!order.assignedUnitId) {
      return false;
    }

    const hasDelivery = await this.dataSource.getRepository(ServiceOrderDelivery).exists({
      where: {
        serviceOrderId: order.id,
      },
    });

    if (hasDelivery) {
      const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

      if (allowedUnitIds === null) {
        return true;
      }

      if (allowedUnitIds.length === 0) {
        return false;
      }

      const delivery = await this.dataSource.getRepository(ServiceOrderDelivery).findOne({
        where: allowedUnitIds.map((unitId) => ({
          serviceOrderId: order.id,
          recipientUnitId: unitId,
        })),
      });

      return !!delivery;
    }

    return this.accessScope.canAccessUnit(user, order.assignedUnitId);
  }

  private async ensureCanChangeOrder(
    order: ServiceOrder,
    user: AuthUser,
  ): Promise<void> {
    if (user.role === 'observer') {
      throw new BadRequestException('Спостерігач не може змінювати заявки');
    }

    if (user.role === 'admin' || user.scope === 'main') {
      return;
    }

    if (!order.assignedUnitId) {
      throw new BadRequestException('Заявка ще не призначена підрозділу');
    }

    const canAccess = await this.accessScope.canAccessUnit(
      user,
      order.assignedUnitId,
    );

    if (!canAccess) {
      throw new BadRequestException('Немає доступу до цієї заявки');
    }
  }

  private async ensureCanExecuteOrder(
    order: ServiceOrder,
    user: AuthUser,
  ): Promise<void> {
    if (user.role !== 'operator') {
      throw new BadRequestException(
        'Виконавчі дії доступні тільки оператору підрозділу виконавця',
      );
    }

    if (user.scope === 'main' || user.scope === 'division') {
      throw new BadRequestException(
        'Головний пункт і дивізіон тільки контролюють виконання. Приймати, починати, завершувати і редагувати звіт може оператор підрозділу виконавця',
      );
    }

    if (user.scope !== 'battery') {
      throw new BadRequestException(
        'Виконавчі дії доступні тільки оператору підрозділу виконавця',
      );
    }

    if (!user.unitId) {
      throw new BadRequestException(
        'Для оператора підрозділу виконавця не визначено підрозділ',
      );
    }

    if (!order.assignedUnitId) {
      throw new BadRequestException('Заявка ще не надіслана виконавцю');
    }

    if (order.assignedUnitId !== user.unitId) {
      throw new BadRequestException(
        'Ця заявка належить іншому підрозділу виконавця і недоступна для виконання',
      );
    }
  }

  private isConsumableExecutionRecord(record: ExecutionRecord): boolean {
    return record.executionType === 'artillery' || record.artillery !== null;
  }

  private buildExecutionDeviationSummary(
    plannedQuantity: number,
    actualQuantity: number,
    postedRecords: ExecutionRecord[],
  ): string | null {
    if (plannedQuantity === actualQuantity) {
      return null;
    }

    const purposes = postedRecords.reduce<Record<string, number>>((acc, item) => {
      acc[item.purpose] = this.roundStockQuantity((acc[item.purpose] ?? 0) + Number(item.quantity ?? 0));
      return acc;
    }, {});

    const direction = actualQuantity > plannedQuantity ? 'перевищення плану' : 'менше плану';
    return `Відхилення: ${direction}. План: ${plannedQuantity}, факт: ${actualQuantity}. Журнал: ${JSON.stringify(purposes)}`;
  }

  private async writeOrderEvent(
    order: ServiceOrder,
    user: AuthUser,
    action: string,
    title: string,
  ): Promise<void> {
    try {
      await this.eventLogs.create({
        eventType: 'service_order',
        action,
        actor: user,
        unitId:
          order.assignedUnitId ??
          order.selectedFirePosition?.unitId ??
          user.unitId ??
          null,
        unitName: order.selectedFirePosition?.unit?.name ?? null,
        entityType: 'service_order',
        entityId: order.id,
        entityName: order.orderNumber,
        title,
        details: `${user.fullName || user.login}: ${title} ${order.orderNumber}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to write service order event ${order.id}: ${message}`,
      );
    }
  }

  private notifyRealtime(
    orderOrId?: ServiceOrder | string,
    action:
      | 'created'
      | 'updated'
      | 'deleted'
      | 'sent'
      | 'accepted'
      | 'rejected'
      | 'started'
      | 'completed'
      | 'changed' = 'updated',
    scopes: Array<'missions' | 'map' | 'stock' | 'analytics' | 'events'> = [
      'missions',
      'map',
      'analytics',
      'events',
    ],
  ): void {
    const order = typeof orderOrId === 'string' ? null : orderOrId;
    const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId?.id;
    const unitId =
      order?.assignedUnitId ?? order?.selectedFirePosition?.unitId ?? undefined;

    this.realtimeEvents.emitMany(scopes, action, {
      entity: 'service_order',
      id: orderId,
      unitId,
    });
  }
}


