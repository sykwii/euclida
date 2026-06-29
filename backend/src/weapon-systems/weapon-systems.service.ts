import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { EventLogsService } from '../event-logs/event-logs.service';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateWeaponSystemDto } from './dto/create-weapon-system.dto';
import { UpdateWeaponSystemDto } from './dto/update-weapon-system.dto';
import { AssignWeaponToFirePositionDto } from './dto/assign-weapon-to-fire-position.dto';
import { WeaponSystem } from './weapon-system.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

@Injectable()
export class WeaponSystemsService {
  constructor(
    @InjectRepository(WeaponSystem)
    private readonly repository: Repository<WeaponSystem>,
    private readonly accessScope: AccessScopeService,
    private readonly realtime: RealtimeGateway,
private readonly realtimeEvents: RealtimeEventsService,
    private readonly eventLogs: EventLogsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(user: AuthUser): Promise<WeaponSystem[]> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return [];
    }

    return this.repository.find({
      where: allowedUnitIds === null ? {} : { unitId: In(allowedUnitIds) },
      relations: {
        unit: true,
        weaponModel: true,
        firePosition: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string, user: AuthUser): Promise<WeaponSystem> {
    const item = await this.repository.findOne({
      where: { id },
      relations: {
        unit: true,
        weaponModel: true,
        firePosition: true,
      },
    });

    if (!item) {
      throw new NotFoundException('СГ не знайдено');
    }

    await this.ensureCanUseUnit(user, item.unitId);

    return item;
  }

  async create(data: CreateWeaponSystemDto, user: AuthUser): Promise<WeaponSystem> {
    const locationType = data.locationType ?? 'reserve';

    if (locationType === 'reserve') {
      const unitId = data.unitId ?? user.unitId;

      if (!unitId) {
        throw new BadRequestException('Для РЗ потрібно вибрати підрозділ');
      }

      await this.ensureCanUseUnit(user, unitId);

      data.locationType = 'reserve';
      data.unitId = unitId;
      data.firePositionId = null;
    }

    if (locationType === 'fire_position') {
      if (!data.firePositionId) {
        throw new BadRequestException('Потрібно вибрати ВП');
      }

      const firePosition = await this.dataSource.getRepository(FirePosition).findOne({
        where: { id: data.firePositionId },
      });

      if (!firePosition) {
        throw new BadRequestException('ВП не знайдено');
      }

      const weaponOwnerUnitId = data.unitId ?? user.unitId ?? firePosition.unitId;

      if (!weaponOwnerUnitId) {
        throw new BadRequestException('Неможливо визначити підрозділ СГ');
      }

      await this.ensureCanUseUnit(user, weaponOwnerUnitId);

      await this.detachOtherWeaponsFromFirePosition(data.firePositionId, null);

      firePosition.unitId = weaponOwnerUnitId;
      await this.dataSource.getRepository(FirePosition).save(firePosition);

      data.locationType = 'fire_position';
      data.unitId = weaponOwnerUnitId;
    }

    const item = this.repository.create(data);
    const saved = await this.repository.save(item);

    await this.syncFirePositionWeaponState(saved.firePositionId);
    await this.writeWeaponEvent(saved, user, 'created');
    this.emitWeaponChanged('created', saved.id);

    return saved;
  }

  async update(
    id: string,
    data: UpdateWeaponSystemDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const item = await this.findOne(id, user);
    const previousFirePositionId = item.firePositionId;
    const nextLocationType = data.locationType ?? item.locationType;

    if (nextLocationType === 'reserve') {
      const nextUnitId = data.unitId ?? item.unitId;

      if (!nextUnitId) {
        throw new BadRequestException('Для РЗ потрібно вибрати підрозділ');
      }

      await this.ensureCanUseUnit(user, nextUnitId);

      data.locationType = 'reserve';
      data.unitId = nextUnitId;
      data.firePositionId = null;
    }

    if (nextLocationType === 'fire_position') {
      const shouldChangeFirePosition =
        item.locationType !== 'fire_position' || data.firePositionId !== undefined;
      const nextFirePositionId = shouldChangeFirePosition
        ? data.firePositionId
        : item.firePositionId;

      if (!nextFirePositionId) {
        throw new BadRequestException('Потрібно вибрати ВП');
      }

      const firePosition = await this.dataSource.getRepository(FirePosition).findOne({
        where: { id: nextFirePositionId },
      });

      if (!firePosition) {
        throw new BadRequestException('ВП не знайдено');
      }

      const weaponOwnerUnitId = data.unitId ?? item.unitId ?? user.unitId;

      if (!weaponOwnerUnitId) {
        throw new BadRequestException('Неможливо визначити підрозділ СГ');
      }

      await this.ensureCanUseUnit(user, weaponOwnerUnitId);

      await this.detachOtherWeaponsFromFirePosition(nextFirePositionId, item.id);

      firePosition.unitId = weaponOwnerUnitId;
      await this.dataSource.getRepository(FirePosition).save(firePosition);

      data.locationType = 'fire_position';
      data.firePositionId = nextFirePositionId;
      data.unitId = weaponOwnerUnitId;
    }

    Object.assign(item, data);

    const saved = await this.repository.save(item);

    await this.syncFirePositionWeaponState(previousFirePositionId);
    await this.syncFirePositionWeaponState(saved.firePositionId);
    await this.writeWeaponEvent(
      saved,
      user,
      saved.locationType === 'fire_position' ? 'assigned' : 'updated',
    );
    this.emitWeaponChanged('updated', saved.id);

    return saved;
  }


  async assignToFirePosition(
    id: string,
    data: AssignWeaponToFirePositionDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const targetFirePositionId = data.targetFirePositionId ?? data.firePositionId;

    if (!targetFirePositionId) {
      throw new BadRequestException('Потрібно вибрати нову ВП');
    }

    const weapon = await this.findOne(id, user);
    const previousFirePositionId = weapon.firePositionId;

    if (previousFirePositionId === targetFirePositionId && weapon.locationType === 'fire_position') {
      return weapon;
    }

    const firePositionRepository = this.dataSource.getRepository(FirePosition);
    const targetFirePosition = await firePositionRepository.findOne({
      where: { id: targetFirePositionId },
    });

    if (!targetFirePosition) {
      throw new BadRequestException('ВП не знайдено');
    }

    const weaponOwnerUnitId = data.unitId || weapon.unitId || user.unitId || targetFirePosition.unitId;

    if (!weaponOwnerUnitId) {
      throw new BadRequestException('Неможливо визначити підрозділ СГ');
    }

    await this.ensureCanUseUnit(user, weaponOwnerUnitId);

    await this.detachOtherWeaponsFromFirePosition(targetFirePositionId, weapon.id);

    targetFirePosition.unitId = weaponOwnerUnitId;
    await firePositionRepository.save(targetFirePosition);

    weapon.locationType = 'fire_position';
    weapon.firePositionId = targetFirePositionId;
    weapon.unitId = weaponOwnerUnitId;

    const saved = await this.repository.save(weapon);

    await this.syncFirePositionWeaponState(previousFirePositionId);
    await this.syncFirePositionWeaponState(targetFirePositionId);
    await this.writeWeaponEvent(saved, user, 'assigned');
    this.emitWeaponChanged('moved', saved.id);

    return this.findOne(saved.id, user);
  }

  async moveToReserve(id: string, user: AuthUser): Promise<WeaponSystem> {
    const item = await this.findOne(id, user);
    const previousFirePositionId = item.firePositionId;

    if (!item.unitId) {
      throw new BadRequestException('У СГ не вказано підрозділ');
    }

    await this.ensureCanUseUnit(user, item.unitId);

    await this.repository.update(item.id, {
      locationType: 'reserve',
      firePositionId: null,
    });

    const saved = await this.findOne(item.id, user);

    await this.syncFirePositionWeaponState(previousFirePositionId);
    await this.writeWeaponEvent(saved, user, 'moved');
    this.emitWeaponChanged('moved', saved.id);

    return saved;
  }

  async syncAllFirePositionStates(user: AuthUser): Promise<{ updated: number }> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    const firePositionRepository = this.dataSource.getRepository(FirePosition);

    const firePositions = await firePositionRepository.find({
      where: allowedUnitIds === null ? {} : { unitId: In(allowedUnitIds) },
      select: { id: true },
    });

    for (const firePosition of firePositions) {
      await this.syncFirePositionWeaponState(firePosition.id);
    }
    this.emitWeaponChanged('synced');

    return { updated: firePositions.length };
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const item = await this.findOne(id, user);
    const previousFirePositionId = item.firePositionId;

    await this.repository.remove(item);
    await this.syncFirePositionWeaponState(previousFirePositionId);
    await this.writeWeaponEvent(item, user, 'deleted');
    this.emitWeaponChanged('deleted', item.id);
  }

  private async ensureCanUseUnit(user: AuthUser, unitId: string | null): Promise<void> {
    if (!unitId) {
      throw new ForbiddenException('Потрібно обрати підрозділ');
    }

    const canAccess = await this.accessScope.canAccessUnit(user, unitId);

    if (!canAccess) {
      throw new ForbiddenException('Немає доступу до СГ цього підрозділу');
    }
  }

  private async syncFirePositionWeaponState(
  firePositionId: string | null,
): Promise<void> {
  if (!firePositionId) {
    return;
  }

  const firePositionRepository = this.dataSource.getRepository(FirePosition);
  const weaponRepository = this.dataSource.getRepository(WeaponSystem);

  const firePosition = await firePositionRepository.findOne({
    where: { id: firePositionId },
  });

  if (!firePosition) {
    return;
  }

  const weapon = await weaponRepository.findOne({
    where: { firePositionId, locationType: 'fire_position' },
    order: { updatedAt: 'DESC' },
  });

  if (!weapon) {
    await firePositionRepository.update(firePositionId, {
      hasSg: false,
      readinessStatus: 'not_ready',
      notReadyReason: 'Відсутня СГ',
    });
    return;
  }

  await firePositionRepository.update(firePositionId, {
    hasSg: true,
    unitId: weapon.unitId,
    readinessStatus:
      weapon.readinessStatus === 'ready' ? 'ready' : 'not_ready',
    notReadyReason:
      weapon.readinessStatus === 'ready'
        ? null
        : weapon.readinessStatus === 'repair'
          ? 'СГ в ремонті'
          : weapon.notReadyReason || 'СГ не БГ',
  });
}

  private async detachOtherWeaponsFromFirePosition(
    firePositionId: string,
    exceptWeaponId: string | null,
  ): Promise<void> {
    const weaponRepository = this.dataSource.getRepository(WeaponSystem);

    const assignedWeapons = await weaponRepository.find({
      where: { firePositionId, locationType: 'fire_position' },
    });

    for (const weapon of assignedWeapons) {
      if (exceptWeaponId && weapon.id === exceptWeaponId) {
        continue;
      }

      const previousFirePositionId = weapon.firePositionId;

      await weaponRepository.update(weapon.id, {
        locationType: 'reserve',
        firePositionId: null,
      });
      await this.syncFirePositionWeaponState(previousFirePositionId);
    }
  }


  private emitWeaponChanged(
    action: 'created' | 'updated' | 'deleted' | 'moved' | 'synced' = 'moved',
    id?: string,
  ): void {
    this.realtimeEvents.emitMany(
      ['weapons', 'map', 'analytics', 'events'],
      action,
      {
        entity: 'weapon_system',
        id,
      },
    );
  }

  private async writeWeaponEvent(
    weapon: WeaponSystem,
    user: AuthUser,
    action: 'created' | 'updated' | 'assigned' | 'moved' | 'deleted',
  ): Promise<void> {
    const titles: Record<typeof action, string> = {
      created: 'Створено СГ',
      updated: 'Оновлено СГ',
      assigned: 'СГ призначено на ВП',
      moved: 'СГ повернуто в РЗ',
      deleted: 'СГ видалено',
    };

    await this.eventLogs.create({
      eventType: 'weapon',
      action,
      actor: user,
      unitId: weapon.unitId,
      unitName: weapon.unit?.name ?? null,
      entityType: 'weapon_system',
      entityId: weapon.id,
      entityName: weapon.callsign || weapon.serialNumber || 'СГ',
      title: titles[action],
      details: `${user.fullName || user.login}: ${titles[action]} ${weapon.callsign || weapon.serialNumber || ''}`,
    });
  }
}
