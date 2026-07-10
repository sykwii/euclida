import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { AuthUser } from '../auth/auth-user.types';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { StockMovement } from '../stock-movements/stock-movement.entity';
import { RealtimeEventsService }
from '../realtime/realtime-events.service';
import { Unit } from '../units/unit.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { CompleteFireMissionDto } from './dto/complete-fire-mission.dto';
import { CreateFireMissionDto } from './dto/create-fire-mission.dto';
import { FireMissionStatus, UpdateFireMissionStatusDto } from './dto/update-fire-mission-status.dto';
import { FireMission } from './fire-mission.entity';

const EXECUTOR_SCOPES = ['battery'];

@Injectable()
export class FireMissionsService {
  constructor(
    @InjectRepository(FireMission)
    private readonly repository: Repository<FireMission>,
    @InjectRepository(Unit)
    private readonly unitsRepository: Repository<Unit>,
    @InjectRepository(FirePosition)
    private readonly firePositionsRepository: Repository<FirePosition>,
    @InjectRepository(WeaponSystem)
    private readonly weaponSystemsRepository: Repository<WeaponSystem>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async findAllForUser(user: AuthUser): Promise<FireMission[]> {
    const items = await this.repository.find({
      relations: this.relations,
      order: { missionDatetime: 'DESC' },
    });

    return items
      .filter((item) => this.canSee(item, user))
      .map((item) => this.withAccessFlags(item, user));
  }

  async findOneForUser(id: string, user: AuthUser): Promise<FireMission> {
    const item = await this.findOne(id);

    if (!this.canSee(item, user)) {
      throw new ForbiddenException('Немає доступу до цього вогневого завдання');
    }

    return this.withAccessFlags(item, user);
  }

  async findOne(id: string): Promise<FireMission> {
    const item = await this.repository.findOne({
      where: { id },
      relations: this.relations,
    });

    if (!item) {
      throw new NotFoundException('Вогневе завдання не знайдено');
    }

    return item;
  }

  async create(data: CreateFireMissionDto, user: AuthUser): Promise<FireMission> {
    if (!data.firePositionId) {
      throw new BadRequestException('Оберіть ВП. Підрозділ визначається автоматично');
    }

    const firePosition = await this.firePositionsRepository.findOne({
      where: { id: data.firePositionId },
      relations: { unit: { parent: { parent: true } } },
    });

    if (!firePosition) {
      throw new BadRequestException('ВП не знайдено');
    }

    const weaponSystem = await this.findActiveWeaponOnFirePosition(firePosition.id);

    if (!weaponSystem) {
      throw new BadRequestException('На обраній ВП немає активної СГ');
    }

    const executionBattery = await this.resolveExecutionBattery(firePosition, weaponSystem);
    this.assertCanCreateForFirePosition(executionBattery, user);

    const status: FireMissionStatus = data.status === 'sent' ? 'sent' : 'draft';
    const now = new Date();

    const item = this.repository.create({
      ...data,
      authorUserId: user.sub,
      authorUnitId: user.unitId,
      executingUnitId: executionBattery.id,
      firePositionId: firePosition.id,
      weaponSystemId: weaponSystem.id,
      missionDatetime: new Date(data.missionDatetime),
      status,
      sentAt: status === 'sent' ? now : null,
    });

    const saved = await this.repository.save(item);
    this.emitMissionRealtime(saved, status === 'sent' ? 'sent' : 'created');
    return saved;
  }

  async updateStatus(
    id: string,
    data: UpdateFireMissionStatusDto,
    user: AuthUser,
  ): Promise<FireMission> {
    const mission = await this.findOneForUser(id, user);

    if (mission.status === 'closed') {
      throw new BadRequestException('Завдання вже перенесено в історію');
    }

    if (mission.status === 'completed' && data.status !== 'closed') {
      throw new BadRequestException('Після завершення можна тільки закрити завдання');
    }

    const nextStatus = data.status;

    if (nextStatus === 'sent') {
      this.assertAuthor(mission, user);
      if (mission.status !== 'draft') {
        throw new BadRequestException('Надіслати можна тільки чернетку');
      }

      mission.status = 'sent';
      mission.sentAt = new Date();
      return this.saveMissionAndEmit(mission, 'sent');
    }

    if (['accepted', 'rejected', 'in_progress'].includes(nextStatus)) {
      this.assertExecutor(mission, user);
      this.assertTransition(mission.status, nextStatus);

      mission.status = nextStatus;

      if (nextStatus === 'accepted') {
        mission.acceptedAt = new Date();
      }

      if (nextStatus === 'in_progress') {
        mission.startedAt = new Date();
      }

      if (nextStatus === 'rejected') {
        mission.completionComment = data.comment ?? 'Відхилено виконавцем';
      }

      return this.saveMissionAndEmit(mission, nextStatus);
    }

    if (nextStatus === 'cancelled') {
      this.assertAuthor(mission, user);
      if (mission.status === 'completed') {
        throw new BadRequestException('Завершене завдання не можна скасувати');
      }

      mission.status = 'cancelled';
      mission.completionComment = data.comment ?? 'Скасовано автором';
      return this.saveMissionAndEmit(mission, 'cancelled');
    }

    if (nextStatus === 'closed') {
      this.assertAuthor(mission, user);
      if (mission.status !== 'completed') {
        throw new BadRequestException('Закрити можна тільки завершене завдання');
      }

      mission.status = 'closed';
      mission.closedAt = new Date();
      return this.saveMissionAndEmit(mission, 'closed');
    }

    throw new BadRequestException('Недопустима дія для поточного рівня управління');
  }

  async complete(
    id: string,
    data: CompleteFireMissionDto,
    user: AuthUser,
  ): Promise<FireMission> {
    return this.dataSource.transaction(async (manager) => {
      const mission = await manager.findOne(FireMission, {
        where: { id },
        relations: this.relations,
      });

      if (!mission) {
        throw new NotFoundException('Вогневе завдання не знайдено');
      }

      if (!this.canSee(mission, user)) {
        throw new ForbiddenException('Немає доступу до цього вогневого завдання');
      }

      this.assertExecutor(mission, user);

      if (mission.status !== 'in_progress' && mission.status !== 'completed') {
        throw new BadRequestException('Завершити можна тільки завдання в роботі');
      }

      if (mission.status === 'completed') {
        this.assertFinalEditWindow(mission);
        await this.rollbackExistingConsumption(manager, mission);
      }

      if (mission.firePositionId) {
        await manager.increment(
          FirePosition,
          { id: mission.firePositionId },
          'completedVgzCount',
          mission.status === 'completed' ? 0 : 1,
        );
      }

      const ammoDepotId = mission.firePosition?.ammoDepotId;

      if (!ammoDepotId) {
        throw new BadRequestException('Для ВП не створено або не прив’язано БК-склад');
      }

      mission.actualShellQuantity = data.actualShellQuantity ?? 0;
      mission.actualChargeQuantity = data.actualChargeQuantity ?? 0;
      mission.actualPrimerQuantity = data.actualPrimerQuantity ?? 0;
      mission.actualFuzeQuantity = data.actualFuzeQuantity ?? 0;

      await this.decreaseStock(manager, DepotShellStock, ammoDepotId, 'shellId', mission.shellId, mission.actualShellQuantity, 'снарядів');
      await this.decreaseStock(manager, DepotChargeStock, ammoDepotId, 'chargeId', mission.chargeId, mission.actualChargeQuantity, 'зарядів');
      await this.decreaseStock(manager, DepotPrimerStock, ammoDepotId, 'primerId', mission.primerId, mission.actualPrimerQuantity, 'капсулів');
      await this.decreaseStock(manager, DepotFuzeStock, ammoDepotId, 'fuzeId', mission.fuzeId, mission.actualFuzeQuantity, 'підривників');

      await this.createConsumptionMovement(manager, ammoDepotId, mission.id, 'shell', mission.shellId, mission.actualShellQuantity, 'Витрата снарядів по ВГЗ');
      await this.createConsumptionMovement(manager, ammoDepotId, mission.id, 'charge', mission.chargeId, mission.actualChargeQuantity, 'Витрата зарядів по ВГЗ');
      await this.createConsumptionMovement(manager, ammoDepotId, mission.id, 'primer', mission.primerId, mission.actualPrimerQuantity, 'Витрата капсулів по ВГЗ');
      await this.createConsumptionMovement(manager, ammoDepotId, mission.id, 'fuze', mission.fuzeId, mission.actualFuzeQuantity, 'Витрата підривників по ВГЗ');

      mission.status = 'completed';
      mission.completedAt = mission.completedAt ?? new Date();
      mission.finalEditUntil = this.addMinutes(mission.completedAt, 30);
      mission.completionComment = data.comment ?? null;

      const saved = await manager.save(FireMission, mission);
      this.emitMissionRealtime(saved, 'completed');
      return saved;
    });
  }

  async getCompletionAvailability(id: string, user: AuthUser) {
    const mission = await this.findOneForUser(id, user);

    if (!this.isExecutor(mission, user)) {
      throw new ForbiddenException('Фактичний розхід може бачити тільки оператор батареї цієї ВП');
    }

    const ammoDepotId = mission.firePosition?.ammoDepotId;

    if (!ammoDepotId) {
      throw new BadRequestException('Для ВП не створено або не прив’язано БК-склад');
    }

    const shellAvailable = await this.getAvailableQuantity(DepotShellStock, ammoDepotId, 'shellId', mission.shellId);
    const chargeAvailable = await this.getAvailableQuantity(DepotChargeStock, ammoDepotId, 'chargeId', mission.chargeId);
    const primerAvailable = await this.getAvailableQuantity(DepotPrimerStock, ammoDepotId, 'primerId', mission.primerId);
    const fuzeAvailable = await this.getAvailableQuantity(DepotFuzeStock, ammoDepotId, 'fuzeId', mission.fuzeId);

    return {
      missionId: mission.id,
      status: mission.status,
      ammoDepotId,
      finalEditUntil: mission.finalEditUntil,
      planned: {
        shellQuantity: mission.shellQuantity ?? 0,
        chargeQuantity: Number(mission.chargeQuantity ?? 0),
        primerQuantity: mission.primerQuantity ?? 0,
        fuzeQuantity: mission.fuzeQuantity ?? 0,
      },
      available: {
        shellQuantity: shellAvailable,
        chargeQuantity: chargeAvailable,
        primerQuantity: primerAvailable,
        fuzeQuantity: fuzeAvailable,
      },
      recommendedActual: {
        shellQuantity: Math.min(mission.shellQuantity ?? 0, shellAvailable),
        chargeQuantity: Math.min(Number(mission.chargeQuantity ?? 0), chargeAvailable),
        primerQuantity: Math.min(mission.primerQuantity ?? 0, primerAvailable),
        fuzeQuantity: Math.min(mission.fuzeQuantity ?? 0, fuzeAvailable),
      },
    };
  }


  private async saveMissionAndEmit(mission: FireMission, action: string): Promise<FireMission> {
    const saved = await this.repository.save(mission);
    this.emitMissionRealtime(saved, action);
    return saved;
  }

  private emitMissionRealtime(
  mission: FireMission,
  action: string,
): void {

  this.realtimeEvents.emitMany(
    [
      'missions',
      'map',
      'analytics',
      'events',
    ],
    action as any,
    {
      entity: 'fire_mission',
      id: mission.id,
    },
  );

}

  private get relations() {
    return {
      authorUser: true,
      authorUnit: true,
      executingUnit: { parent: { parent: true } },
      firePosition: { unit: true },
      weaponSystem: { weaponModel: true },
      shell: true,
      charge: true,
      primer: true,
      fuze: true,
    } as const;
  }

  private withAccessFlags(mission: FireMission, user: AuthUser): FireMission {
    mission.canExecute = this.isExecutor(mission, user);
    mission.canControl = this.canSee(mission, user) && !mission.canExecute;
    return mission;
  }

  private async resolveExecutionBattery(
    firePosition: FirePosition,
    weaponSystem: WeaponSystem,
  ): Promise<Unit> {
    const candidateIds = [firePosition.unitId, weaponSystem.unitId].filter(
      (value): value is string => Boolean(value),
    );

    for (const candidateId of candidateIds) {
      const candidate = await this.loadUnitChain(candidateId);
      const battery = this.findUnitInChain(candidate, 'battery');

      if (battery) {
        return battery;
      }
    }

    throw new BadRequestException(
      'Не вдалося визначити батарею ВП. Прив’яжіть ВП або СГ до батареї чи підлеглого їй підрозділу',
    );
  }

  private async loadUnitChain(unitId: string): Promise<Unit | null> {
    return this.unitsRepository.findOne({
      where: { id: unitId },
      relations: { parent: { parent: { parent: true } } },
    });
  }

  private findUnitInChain(unit: Unit | null, type: string): Unit | null {
    let current: Unit | null = unit;

    while (current) {
      if (current.type === type) {
        return current;
      }

      current = current.parent ?? null;
    }

    return null;
  }

  private assertCanCreateForFirePosition(executionBattery: Unit, user: AuthUser): void {
    if (user.role === 'admin' || user.scope === 'main') {
      return;
    }

    if (!user.unitId) {
      throw new ForbiddenException('Користувач не прив’язаний до підрозділу');
    }

    if (user.scope === 'battery') {
      if (executionBattery.id !== user.unitId) {
        throw new ForbiddenException('Батарея може створювати завдання тільки для своїх ВП');
      }
      return;
    }

    if (user.scope === 'division') {
      if (!this.isSameOrDescendantUnitSync(executionBattery, user.unitId)) {
        throw new ForbiddenException('Дивізіон може створювати завдання тільки для своїх батарей та ВП');
      }
      return;
    }

    throw new ForbiddenException('Немає права створювати вогневе завдання для цієї ВП');
  }

  private async findActiveWeaponOnFirePosition(firePositionId: string): Promise<WeaponSystem | null> {
    return this.weaponSystemsRepository.findOne({
      where: {
        firePositionId,
        locationType: 'fire_position',
      },
    });
  }

  private canSee(mission: FireMission, user: AuthUser): boolean {
    if (user.role === 'admin') {
      return true;
    }

    if (mission.status === 'draft') {
      return mission.authorUserId === user.sub;
    }

    if (mission.authorUserId === user.sub) {
      return true;
    }

    if (user.scope === 'main') {
      return true;
    }

    if (!user.unitId || !mission.executingUnitId) {
      return false;
    }

    if (user.scope === 'battery') {
      return mission.executingUnitId === user.unitId;
    }

    if (user.scope === 'division') {
      return this.isSameOrDescendantUnitSync(mission.executingUnit, user.unitId);
    }

    return false;
  }

  private isExecutor(mission: FireMission, user: AuthUser): boolean {
    if (user.role === 'admin') {
      return false;
    }

    if (!EXECUTOR_SCOPES.includes(user.scope)) {
      return false;
    }

    return !!user.unitId && mission.executingUnitId === user.unitId;
  }

  private assertExecutor(mission: FireMission, user: AuthUser): void {
    if (!this.isExecutor(mission, user)) {
      throw new ForbiddenException('Цю дію виконує тільки оператор батареї цієї ВП. Дивізіон і головний пункт лише контролюють');
    }
  }

  private assertAuthor(mission: FireMission, user: AuthUser): void {
    if (user.role === 'admin') {
      return;
    }

    if (mission.authorUserId !== user.sub) {
      throw new ForbiddenException('Ця дія доступна тільки автору завдання');
    }
  }

  private assertTransition(current: string, next: string): void {
    const allowed: Record<string, string[]> = {
      sent: ['accepted', 'rejected'],
      accepted: ['in_progress'],
      in_progress: ['completed'],
    };

    if (!allowed[current]?.includes(next)) {
      throw new BadRequestException(`Недопустимий перехід: ${current} → ${next}`);
    }
  }

  private assertFinalEditWindow(mission: FireMission): void {
    if (!mission.finalEditUntil || new Date() > mission.finalEditUntil) {
      throw new BadRequestException('30 хвилин для редагування фактичного розходу вже минули');
    }
  }

  private async rollbackExistingConsumption(manager: EntityManager, mission: FireMission): Promise<void> {
    const ammoDepotId = mission.firePosition?.ammoDepotId;

    if (!ammoDepotId) {
      return;
    }

    await this.increaseStock(manager, DepotShellStock, ammoDepotId, 'shellId', mission.shellId, mission.actualShellQuantity);
    await this.increaseStock(manager, DepotChargeStock, ammoDepotId, 'chargeId', mission.chargeId, mission.actualChargeQuantity);
    await this.increaseStock(manager, DepotPrimerStock, ammoDepotId, 'primerId', mission.primerId, mission.actualPrimerQuantity);
    await this.increaseStock(manager, DepotFuzeStock, ammoDepotId, 'fuzeId', mission.fuzeId, mission.actualFuzeQuantity);
  }

  private async decreaseStock<T extends ObjectLiteral & { quantity: number }>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    depotId: string,
    itemColumn: string,
    itemId: string | null,
    quantity: number | null,
    itemName: string,
  ): Promise<void> {
    if (!itemId || !quantity || quantity <= 0) {
      return;
    }

    const stock = await manager
      .getRepository(entity)
      .createQueryBuilder('stock')
      .where('stock.depot_id = :depotId', { depotId })
      .andWhere(`stock.${this.toSnakeCase(itemColumn)} = :itemId`, { itemId })
      .getOne();

    if (!stock) {
      throw new BadRequestException(`На БК ВП немає ${itemName}`);
    }

    const available = Number(stock.quantity);

    if (available < quantity) {
      throw new BadRequestException(`Недостатньо ${itemName} на БК ВП. Доступно: ${available}, потрібно: ${quantity}`);
    }

    stock.quantity = available - quantity;
    await manager.save(entity, stock);
  }

  private async increaseStock<T extends ObjectLiteral & { quantity: number }>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    depotId: string,
    itemColumn: string,
    itemId: string | null,
    quantity: number | null,
  ): Promise<void> {
    if (!itemId || !quantity || quantity <= 0) {
      return;
    }

    const repository = manager.getRepository(entity);
    const stock = await repository
      .createQueryBuilder('stock')
      .where('stock.depot_id = :depotId', { depotId })
      .andWhere(`stock.${this.toSnakeCase(itemColumn)} = :itemId`, { itemId })
      .getOne();

    if (!stock) {
      return;
    }

    stock.quantity = Number(stock.quantity) + quantity;
    await manager.save(entity, stock);
  }

  private async getAvailableQuantity<T extends ObjectLiteral & { quantity: number }>(
    entity: EntityTarget<T>,
    depotId: string,
    itemColumn: string,
    itemId: string | null,
  ): Promise<number> {
    if (!itemId) {
      return 0;
    }

    const stock = await this.dataSource.manager
      .getRepository(entity)
      .createQueryBuilder('stock')
      .where('stock.depot_id = :depotId', { depotId })
      .andWhere(`stock.${this.toSnakeCase(itemColumn)} = :itemId`, { itemId })
      .getOne();

    return stock ? Number(stock.quantity) : 0;
  }

  private async createConsumptionMovement(
    manager: EntityManager,
    depotId: string,
    fireMissionId: string,
    itemType: string,
    itemId: string | null,
    quantity: number | null,
    comment: string,
  ): Promise<void> {
    if (!itemId || !quantity || quantity <= 0) {
      return;
    }

    const movement = manager.create(StockMovement, {
      fromDepotId: depotId,
      toDepotId: null,
      itemType,
      itemId,
      quantity,
      movementType: 'mission_consumption',
      fireMissionId,
      comment,
    });

    await manager.save(StockMovement, movement);
  }

  private isSameOrDescendantUnitSync(unit: Unit | null, ancestorUnitId: string): boolean {
    let current: Unit | null = unit;

    while (current) {
      if (current.id === ancestorUnitId) {
        return true;
      }

      current = current.parent ?? null;
    }

    return false;
  }

  private toSnakeCase(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60_000);
  }
}
