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
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { EventLogsService } from '../event-logs/event-logs.service';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { CompleteServiceOrderDto } from './dto/complete-service-order.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { SendServiceOrderDto } from './dto/send-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ServiceOrder } from './service-order.entity';
import { ServiceOrderActualAmmo } from './service-order-actual-ammo.entity';
import { ServiceOrderSuggestionsService } from './service-order-suggestions.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { ShellCompatibleCharge } from '../shell-compatible-charges/shell-compatible-charge.entity';
import { StockMovement } from '../stock-movements/stock-movement.entity';

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

@Injectable()
export class ServiceOrdersService {
  private readonly logger = new Logger(ServiceOrdersService.name);

  constructor(
    @InjectRepository(ServiceOrder)
    private readonly repository: Repository<ServiceOrder>,
    private readonly suggestionsService: ServiceOrderSuggestionsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly accessScope: AccessScopeService,
    private readonly eventLogs: EventLogsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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

    return this.suggestionsService.getSuggestions(order);
  }

  async selectPosition(
    id: string,
    body: {
      firePositionId: string;
      shellId: string;
      chargeId: string;
      zoneId: string | null;
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

    const activeStatuses = [
      'proposed',
      'sent',
      'sent_to_division',
      'sent_to_battery',
      'accepted',
      'in_progress',
    ];

    const activeOrder = await this.repository
      .createQueryBuilder('order')
      .where('order.selectedFirePositionId = :firePositionId', {
        firePositionId: body.firePositionId,
      })
      .andWhere('order.status IN (:...statuses)', {
        statuses: activeStatuses,
      })
      .andWhere('order.id <> :orderId', { orderId: order.id })
      .getOne();

    if (activeOrder) {
      throw new BadRequestException('На цю точку вже є активне завдання');
    }

    order.executorType = 'fire_position';
    order.selectedFirePositionId = body.firePositionId;
    order.selectedShellId = body.shellId;
    order.selectedChargeId = body.chargeId;
    order.selectedZoneId = body.zoneId;
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

    if (item.status !== 'proposed') {
      throw new BadRequestException(
        'Надіслати можна тільки заявку, для якої вже обрано виконавця',
      );
    }

    if (item.executorType === 'air_asset_position') {
      if (!item.selectedAirAssetPositionId || !item.selectedAirAssetPosition?.unitId) {
        throw new BadRequestException(
          'Передача можлива тільки після вибору виконавця. Підрозділ виконавця визначається автоматично',
        );
      }

      item.assignedScope = 'battery';
      item.assignedUnitId = item.selectedAirAssetPosition.unitId;
    } else {
      if (!item.selectedFirePositionId || !item.selectedFirePosition?.unitId) {
        throw new BadRequestException(
          'Передача можлива тільки після вибору виконавця. Оператор підрозділу виконавця визначається автоматично',
        );
      }

      item.assignedScope = 'battery';
      item.assignedUnitId = item.selectedFirePosition.unitId;
    }

    item.sentByUserId = user.sub;
    item.status = 'sent';

    const saved = await this.repository.save(item);

    await this.writeOrderEvent(
      saved,
      user,
      'sent',
      item.executorType === 'air_asset_position'
        ? `Заявку передано виконавцю ${item.selectedAirAssetPosition?.callsign || item.selectedAirAssetPosition?.name || ''}. Оператор підрозділу виконавця отримує її автоматично`
        : `Заявку передано на ПУВБ за ВП ${item.selectedFirePosition?.name || ''}. Оператор підрозділу виконавця отримує її автоматично`,
    );

    this.notifyRealtime(saved, 'sent');

    return saved;
  }
  async accept(id: string, user: AuthUser): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);

    await this.ensureCanExecuteOrder(order, user);

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

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      order.status = 'in_progress';
      order.startedAt = new Date();

      if (order.executorType !== 'air_asset_position') {
        await manager.update(FirePosition, order.selectedFirePositionId!, {
          readinessStatus: 'in_progress',
        });
      }

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
        firePosition.readinessStatus = 'ready';
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

  private roundStockQuantity(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
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

    if (order.status === 'in_progress' && order.selectedFirePositionId) {
      await this.dataSource
        .getRepository(FirePosition)
        .update(order.selectedFirePositionId, {
          readinessStatus: 'ready',
        });
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

    // До натискання "Надіслати на ПУВБ" молодші пункти не бачать заявку,
    // навіть якщо головний оператор уже підібрав ВП.
    if (order.status === 'draft' || order.status === 'proposed') {
      return false;
    }

    if (!order.assignedUnitId) {
      return false;
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
