import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { latLngToMgrs, mgrsToLatLng, normalizeMgrs } from '../common/geo/mgrs.util';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { EventLogsService } from '../event-logs/event-logs.service';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CompleteServiceOrderDto } from './dto/complete-service-order.dto';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { SendServiceOrderDto } from './dto/send-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ServiceOrder } from './service-order.entity';
import { ServiceOrderSuggestionsService } from './service-order-suggestions.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';


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
  constructor(
    @InjectRepository(ServiceOrder)
    private readonly repository: Repository<ServiceOrder>,
    private readonly suggestionsService: ServiceOrderSuggestionsService,
    private readonly realtime: RealtimeGateway,
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

  async create(data: CreateServiceOrderDto, user: AuthUser): Promise<ServiceOrder> {
    if (user.role === 'observer') {
      throw new BadRequestException('Спостерігач не може створювати заявки');
    }

    let targetLat = data.targetLat;
    let targetLng = data.targetLng;
    let targetMgrs = data.targetMgrs;

    if (targetMgrs) {
      try {
        targetMgrs = normalizeMgrs(targetMgrs);
      } catch {
        throw new BadRequestException('Некоректний MGRS. Формат: 36U XB 11111 22222');
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

    this.notifyRealtime(savedItem.id, 'created');

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
        throw new BadRequestException('Некоректний MGRS. Формат: 36U XB 11111 22222');
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

    this.notifyRealtime(savedItem.id, 'updated');

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

    this.notifyRealtime(item.id, 'deleted');
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

    if (order.status !== 'draft') {
      throw new BadRequestException('Вибір точки можливий тільки для чернетки');
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
      .getOne();

    if (activeOrder) {
      throw new BadRequestException('На цю точку вже є активне завдання');
    }

    order.selectedFirePositionId = body.firePositionId;
    order.selectedShellId = body.shellId;
    order.selectedChargeId = body.chargeId;
    order.selectedZoneId = body.zoneId;
    order.status = 'proposed';

    const savedOrder = await this.repository.save(order);

    await this.writeOrderEvent(savedOrder, user, 'updated', 'Обрано ВП для заявки');

    this.notifyRealtime(savedOrder.id, 'updated');

    return savedOrder;
  }

  async sendToUnit(
    id: string,
    _body: SendServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const item = await this.findOne(id, user);

    if (user.role !== 'admin' && user.scope !== 'main') {
      throw new BadRequestException(
        'Надсилати заявку на ПУВБ може тільки головний оператор або адміністратор',
      );
    }

    if (item.status !== 'proposed') {
      throw new BadRequestException(
        'Надіслати можна тільки заявку, для якої вже обрано ВП',
      );
    }

    if (!item.selectedFirePositionId || !item.selectedFirePosition?.unitId) {
      throw new BadRequestException(
        'Передача можлива тільки після вибору ВП. Оператор батареї та оператор дивізіону визначаються автоматично',
      );
    }

    item.assignedScope = 'battery';
    item.assignedUnitId = item.selectedFirePosition.unitId;
    item.sentByUserId = user.sub;
    item.status = 'sent';

    const saved = await this.repository.save(item);

    await this.writeOrderEvent(
      saved,
      user,
      'sent',
      `Заявку передано на ПУВБ за ВП ${item.selectedFirePosition.name}. Оператори батареї та дивізіону отримують її автоматично`,
    );

    this.notifyRealtime(saved.id, 'sent');

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

    this.notifyRealtime(savedOrder.id, 'accepted');

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
    order.rejectedByUnitName =
      order.selectedFirePosition?.unit?.name ?? null;
    order.rejectedAt = new Date();

    const savedOrder = await this.repository.save(order);

    await this.writeOrderEvent(savedOrder, user, 'rejected', 'Заявку відхилено');

    this.notifyRealtime(savedOrder.id, 'rejected');

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

    this.notifyRealtime(savedOrder.id, 'updated');

    return savedOrder;
  }

  async start(id: string, user: AuthUser): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);

    await this.ensureCanExecuteOrder(order, user);

    if (order.status !== 'accepted') {
      throw new BadRequestException('Почати можна тільки прийняте завдання');
    }

    if (!order.selectedFirePositionId) {
      throw new BadRequestException('Неможливо почати завдання без обраної точки');
    }

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      order.status = 'in_progress';
      order.startedAt = new Date();

      await manager.update(
        FirePosition,
        order.selectedFirePositionId!,
        {
          readinessStatus: 'in_progress',
        },
      );

      return manager.save(ServiceOrder, order);
    });

    await this.writeOrderEvent(savedOrder, user, 'started', 'Заявку розпочато');

    this.notifyRealtime(savedOrder.id, 'started');

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

    if (
      !order.selectedFirePositionId ||
      !order.selectedShellId ||
      !order.selectedChargeId
    ) {
      throw new BadRequestException(
        'Неможливо завершити завдання без обраної ВП та ресурсів A+B',
      );
    }

    const startedAt = new Date(body.startedAt);
    const completedAt = new Date(body.completedAt);

    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(completedAt.getTime())) {
      throw new BadRequestException('Некоректна дата початку або завершення');
    }

    if (completedAt < startedAt) {
      throw new BadRequestException(
        'Дата завершення не може бути раніше дати початку',
      );
    }

    const nextActualQuantity = Number(body.actualQuantity);

    if (nextActualQuantity <= 0 || !Number.isInteger(nextActualQuantity)) {
      throw new BadRequestException(
        'Фактична витрата має бути цілим числом більше 0',
      );
    }

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      const firePosition = await manager.findOne(FirePosition, {
        where: { id: order.selectedFirePositionId! },
      });

      if (!firePosition?.ammoDepotId) {
        throw new BadRequestException('У вибраної ВП немає локального БК');
      }

      const shellStock = await manager.findOne(DepotShellStock, {
        where: {
          depotId: firePosition.ammoDepotId,
          shellId: order.selectedShellId!,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      const chargeStock = await manager.findOne(DepotChargeStock, {
        where: {
          depotId: firePosition.ammoDepotId,
          chargeId: order.selectedChargeId!,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!shellStock) {
        throw new BadRequestException(
          'На локальному БК ВП немає обраного ресурсу A',
        );
      }

      if (!chargeStock) {
        throw new BadRequestException(
          'На локальному БК ВП немає обраного ресурсу B',
        );
      }

      const previousActualQuantity = Number(order.actualQuantity ?? 0);
      const quantityDiff = isEditingCompleted
        ? nextActualQuantity - previousActualQuantity
        : nextActualQuantity;

      if (quantityDiff > 0) {
        if (Number(shellStock.quantity) < quantityDiff) {
          throw new BadRequestException(
            `Недостатньо ресурсу A на локальному БК ВП. Потрібно додатково: ${quantityDiff}`,
          );
        }

        if (Number(chargeStock.quantity) < quantityDiff) {
          throw new BadRequestException(
            `Недостатньо ресурсу B на локальному БК ВП. Потрібно додатково: ${quantityDiff}`,
          );
        }
      }

      if (quantityDiff !== 0) {
        shellStock.quantity = Number(shellStock.quantity) - quantityDiff;
        chargeStock.quantity = Number(chargeStock.quantity) - quantityDiff;

        await manager.save(DepotShellStock, shellStock);
        await manager.save(DepotChargeStock, chargeStock);
      }

      order.status = 'completed';
      order.startedAt = startedAt;
      order.completedAt = completedAt;
      order.actualQuantity = nextActualQuantity;
      order.resultType = body.resultType;
      order.resultComment = body.resultComment?.trim() || null;
      order.completedByUserId = user.sub;

      const saved = await manager.save(ServiceOrder, order);

      if (isFirstCompletion) {
        firePosition.readinessStatus = 'ready';
        firePosition.completedVgzCount =
          Number(firePosition.completedVgzCount ?? 0) + 1;

        await manager.save(FirePosition, firePosition);
      }

      return saved;
    });

    await this.writeOrderEvent(savedOrder, user, 'completed', 'Заявку завершено');

    this.notifyRealtime(savedOrder.id, 'completed', ['missions', 'map', 'stock', 'analytics', 'events']);

    return savedOrder;
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
      await this.dataSource.getRepository(FirePosition).update(
        order.selectedFirePositionId,
        {
          readinessStatus: 'ready',
        },
      );
    }

    order.status = 'cancelled';
    order.rejectionReason = reason?.trim() || 'Скасовано оператором';

    const savedOrder = await this.repository.save(order);

    await this.writeOrderEvent(savedOrder, user, 'cancelled', 'Заявку скасовано');

    this.notifyRealtime(savedOrder.id, 'updated');

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
      },
      order: {
        completedAt: 'DESC',
      },
    });

    return items.map((item): ServiceOrderMapResult => ({
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
    }));
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

  private async canViewOrder(order: ServiceOrder, user: AuthUser): Promise<boolean> {
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
        'Адміністратор і спостерігач не виконують заявку. Виконавчі дії доступні тільки оператору батареї цієї ВП',
      );
    }

    if (user.scope === 'main' || user.scope === 'division') {
      throw new BadRequestException(
        'Головний пункт і дивізіон тільки контролюють виконання. Приймати, починати, завершувати і редагувати звіт може оператор батареї цієї ВП',
      );
    }

    if (user.scope !== 'battery') {
      throw new BadRequestException(
        'Виконавчі дії доступні тільки оператору батареї, якій належить вибрана ВП',
      );
    }

    if (!user.unitId) {
      throw new BadRequestException('Для оператора батареї не визначено підрозділ');
    }

    if (!order.assignedUnitId) {
      throw new BadRequestException('Заявка ще не надіслана на ПУВБ');
    }

    if (order.assignedUnitId !== user.unitId) {
      throw new BadRequestException(
        'Ця заявка належить іншій батареї і недоступна для виконання',
      );
    }
  }

  private async writeOrderEvent(
    order: ServiceOrder,
    user: AuthUser,
    action: string,
    title: string,
  ): Promise<void> {
    await this.eventLogs.create({
      eventType: 'service_order',
      action,
      actor: user,
      unitId: order.assignedUnitId ?? order.selectedFirePosition?.unitId ?? null,
      unitName: order.selectedFirePosition?.unit?.name ?? null,
      entityType: 'service_order',
      entityId: order.id,
      entityName: order.orderNumber,
      title,
      details: `${user.fullName || user.login}: ${title} ${order.orderNumber}`,
    });
  }

  private notifyRealtime(
    orderId?: string,
    action: 'created' | 'updated' | 'deleted' | 'sent' | 'accepted' | 'rejected' | 'started' | 'completed' | 'changed' = 'updated',
    scopes: Array<'missions' | 'map' | 'stock' | 'analytics' | 'events'> = ['missions', 'map', 'analytics', 'events'],
  ): void {
    this.realtimeEvents.emitMany(scopes, action, {
      entity: 'service_order',
      id: orderId,
    });
  }
}
