import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { EventLogsService } from '../event-logs/event-logs.service';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { OperationalNotificationsService } from '../operational-notifications/operational-notifications.service';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { AssignWeaponToFirePositionDto } from './dto/assign-weapon-to-fire-position.dto';
import { CompleteWeaponMaintenanceDto } from './dto/complete-weapon-maintenance.dto';
import { ConfirmWeaponReadinessDto } from './dto/confirm-weapon-readiness.dto';
import { CreateWeaponDeploymentDto } from './dto/create-weapon-deployment.dto';
import { CreateWeaponSystemDto } from './dto/create-weapon-system.dto';
import { ExtendMaintenanceDto } from './dto/extend-maintenance.dto';
import { OpenWeaponMaintenanceDto } from './dto/open-weapon-maintenance.dto';
import { RequestMaintenanceDto } from './dto/request-maintenance.dto';
import { UpdateWeaponDeploymentDto } from './dto/update-weapon-deployment.dto';
import { UpdateWeaponSystemDto } from './dto/update-weapon-system.dto';
import { WeaponDeployment } from './weapon-deployment.entity';
import { WeaponMaintenance } from './weapon-maintenance.entity';
import {
  activeMaintenanceFromHistory,
  getActiveMaintenance,
} from './weapon-maintenance-state';
import { WeaponSystem } from './weapon-system.entity';

type WeaponReadinessStatus = 'combat_ready' | 'not_combat_ready';
type WeaponNotReadyReason =
  | 'breakdown'
  | 'air_threat'
  | 'crew'
  | 'maintenance'
  | 'other';
type DeploymentStatus =
  | 'reserve_area'
  | 'moving_to_fire_position'
  | 'at_fire_position'
  | 'moving_to_reserve_area';
type DeploymentLocationType = 'reserve_area' | 'fire_position';
type DeploymentLifecycleStatus = 'planned' | 'moving' | 'arrived' | 'cancelled';
type MaintenanceReason = 'breakdown' | 'scheduled' | 'inspection' | 'other';
type MaintenanceStatus = 'opened' | 'in_progress' | 'completed' | 'cancelled';
type WeaponEventAction =
  | 'created'
  | 'updated'
  | 'assigned'
  | 'moved'
  | 'deleted';
type MaintenanceEventAction =
  | 'opened'
  | 'started'
  | 'cancelled'
  | 'extended'
  | 'completed';
type DeploymentEventAction = 'planned' | 'started' | 'arrived' | 'cancelled';

interface WeaponDeploymentContext {
  weapon: WeaponSystem;
  firePosition: FirePosition | null;
  deployment: WeaponDeployment;
}

const ACTIVE_ORDER_STATUSES = [
  'accepted',
  'in_progress',
  'sent_to_battery',
  'sent_to_division',
];

@Injectable()
export class WeaponSystemsService implements OnModuleInit {
  constructor(
    @InjectRepository(WeaponSystem)
    private readonly repository: Repository<WeaponSystem>,
    private readonly accessScope: AccessScopeService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly eventLogs: EventLogsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly operationalNotifications?: OperationalNotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE weapon_systems
      ADD COLUMN IF NOT EXISTS maintenance_status VARCHAR(30),
      ADD COLUMN IF NOT EXISTS maintenance_requested_start_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS maintenance_planned_end_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS maintenance_actual_end_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS maintenance_note TEXT,
      ADD COLUMN IF NOT EXISTS maintenance_requested_by_user_id UUID,
      ADD COLUMN IF NOT EXISTS maintenance_approved_by_user_id UUID,
      ADD COLUMN IF NOT EXISTS deployment_status VARCHAR(40) NOT NULL DEFAULT 'reserve_area',
      ADD COLUMN IF NOT EXISTS current_fire_position_id UUID,
      ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS archived_by_user_id UUID
    `);
  }

  async findAll(user: AuthUser): Promise<WeaponSystem[]> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return [];
    }

    const items = await this.repository.find({
      where:
        allowedUnitIds === null
          ? { isArchived: false }
          : { unitId: In(allowedUnitIds), isArchived: false },
      relations: this.weaponRelations(),
      order: { createdAt: 'DESC' },
    });
    await this.decorateWeaponResponses(items);
    return items;
  }

  async findOne(id: string, user: AuthUser): Promise<WeaponSystem> {
    const item = await this.repository.findOne({
      where: { id },
      relations: this.weaponRelations(),
    });

    if (!item) {
      throw new NotFoundException('СГ не знайдено');
    }
    await this.ensureCanUseUnit(user, item.unitId);
    await this.decorateWeaponResponses([item]);
    return item;
  }

  async create(
    data: CreateWeaponSystemDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const unitId = data.unitId ?? user.unitId;

    if (!unitId) {
      throw new BadRequestException('Для РЗ потрібно вибрати підрозділ');
    }

    await this.ensureCanUseUnit(user, unitId);

    this.rejectDirectLocationMutation(data, null);

    const item = this.repository.create({
      ...data,
      unitId,
      locationType: 'reserve',
      firePositionId: null,
      currentFirePositionId: null,
      deploymentStatus: 'reserve_area',
      readinessStatus: this.normalizeWeaponReadiness(data.readinessStatus),
      notReadyReason: this.normalizeWeaponReason(
        data.notReadyReason,
        this.normalizeWeaponReadiness(data.readinessStatus),
      ),
    });

    const saved = await this.repository.save(item);
    await this.writeWeaponEvent(saved, user, 'created');
    this.emitWeaponChanged('created', saved.id);
    return this.findOne(saved.id, user);
  }

  async update(
    id: string,
    data: UpdateWeaponSystemDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    this.ensureMaintenanceFieldOperator(user);
    const item = await this.findOne(id, user);
    const previousReadinessStatus = item.readinessStatus;
    await this.ensureCanUseUnit(user, data.unitId ?? item.unitId);
    this.rejectDirectLocationMutation(data, item);

    if (data.readinessStatus !== undefined) {
      item.readinessStatus = this.normalizeWeaponReadiness(
        data.readinessStatus,
      );
      item.notReadyReason = this.normalizeWeaponReason(
        data.notReadyReason ?? item.notReadyReason,
        item.readinessStatus as WeaponReadinessStatus,
      );
    } else if (data.notReadyReason !== undefined) {
      item.notReadyReason = this.normalizeWeaponReason(
        data.notReadyReason,
        item.readinessStatus as WeaponReadinessStatus,
      );
    }

    const assignable: Partial<WeaponSystem> = {
      weaponModelId: data.weaponModelId ?? item.weaponModelId,
      serialNumber: data.serialNumber ?? item.serialNumber,
      callsign: data.callsign ?? item.callsign,
      unitId: data.unitId ?? item.unitId,
      readinessStatus: item.readinessStatus,
      notReadyReason: item.notReadyReason,
    };

    Object.assign(item, assignable);
    const saved = await this.repository.save(item);
    await this.writeWeaponEvent(saved, user, 'updated');
    this.emitWeaponChanged('updated', saved.id, [saved.currentFirePositionId]);
    await this.operationalNotifications?.notifyWeaponReadinessTransition(
      previousReadinessStatus,
      saved.id,
      user.sub,
    );
    return this.findOne(saved.id, user);
  }

  async assignToFirePosition(
    id: string,
    data: AssignWeaponToFirePositionDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const targetFirePositionId =
      data.targetFirePositionId ?? data.firePositionId;
    const result = await this.arriveAtFirePosition(
      id,
      targetFirePositionId,
      true,
      user,
      data,
    );
    await this.writeDeploymentEvent(
      result.weapon,
      result.deployment,
      user,
      'arrived',
    );
    await this.writeWeaponEvent(result.weapon, user, 'assigned');
    this.emitWeaponChanged(
      'moved',
      result.weapon.id,
      this.firePositionIds(result.weapon, result.deployment),
    );
    return this.findOne(result.weapon.id, user);
  }

  async planMoveToFirePosition(
    id: string,
    body: CreateWeaponDeploymentDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const targetFirePositionId =
      body.targetFirePositionId ?? body.firePositionId;
    const result = await this.planDeployment(
      id,
      'fire_position',
      targetFirePositionId,
      body.force === true,
      body.note,
      user,
    );
    await this.writeDeploymentEvent(
      result.weapon,
      result.deployment,
      user,
      'planned',
    );
    this.emitWeaponChanged(
      'updated',
      result.weapon.id,
      this.firePositionIds(result.weapon, result.deployment),
    );
    return this.findOne(result.weapon.id, user);
  }

  async startMoveToFirePosition(
    id: string,
    body: CreateWeaponDeploymentDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const result = await this.startDeployment(id, 'fire_position', body, user);
    await this.writeDeploymentEvent(
      result.weapon,
      result.deployment,
      user,
      'started',
    );
    this.emitWeaponChanged(
      'moved',
      result.weapon.id,
      this.firePositionIds(result.weapon, result.deployment),
    );
    return this.findOne(result.weapon.id, user);
  }

  async confirmFirePositionArrival(
    id: string,
    body: CreateWeaponDeploymentDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const targetFirePositionId =
      body.targetFirePositionId ?? body.firePositionId;
    const result = await this.arriveAtFirePosition(
      id,
      targetFirePositionId,
      false,
      user,
      body,
    );
    await this.writeDeploymentEvent(
      result.weapon,
      result.deployment,
      user,
      'arrived',
    );
    this.emitWeaponChanged(
      'moved',
      result.weapon.id,
      this.firePositionIds(result.weapon, result.deployment),
    );
    return this.findOne(result.weapon.id, user);
  }

  async moveToReserve(id: string, user: AuthUser): Promise<WeaponSystem> {
    const result = await this.arriveAtReserve(id, true, user, {});
    await this.writeDeploymentEvent(
      result.weapon,
      result.deployment,
      user,
      'arrived',
    );
    await this.writeWeaponEvent(result.weapon, user, 'moved');
    this.emitWeaponChanged(
      'moved',
      result.weapon.id,
      this.firePositionIds(result.weapon, result.deployment),
    );
    return this.findOne(result.weapon.id, user);
  }

  async planMoveToReserve(
    id: string,
    body: UpdateWeaponDeploymentDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const result = await this.planDeployment(
      id,
      'reserve_area',
      null,
      true,
      body.note,
      user,
    );
    await this.writeDeploymentEvent(
      result.weapon,
      result.deployment,
      user,
      'planned',
    );
    this.emitWeaponChanged(
      'updated',
      result.weapon.id,
      this.firePositionIds(result.weapon, result.deployment),
    );
    return this.findOne(result.weapon.id, user);
  }

  async startMoveToReserve(
    id: string,
    body: UpdateWeaponDeploymentDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const result = await this.startDeployment(id, 'reserve_area', body, user);
    await this.writeDeploymentEvent(
      result.weapon,
      result.deployment,
      user,
      'started',
    );
    this.emitWeaponChanged(
      'moved',
      result.weapon.id,
      this.firePositionIds(result.weapon, result.deployment),
    );
    return this.findOne(result.weapon.id, user);
  }

  async confirmReserveArrival(
    id: string,
    body: UpdateWeaponDeploymentDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const result = await this.arriveAtReserve(id, false, user, body);
    await this.writeDeploymentEvent(
      result.weapon,
      result.deployment,
      user,
      'arrived',
    );
    this.emitWeaponChanged(
      'moved',
      result.weapon.id,
      this.firePositionIds(result.weapon, result.deployment),
    );
    return this.findOne(result.weapon.id, user);
  }

  async cancelDeployment(id: string, user: AuthUser): Promise<WeaponSystem> {
    const result = await this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      const deployment = await this.findMutableDeployment(
        manager.getRepository(WeaponDeployment),
        weapon.id,
        null,
      );

      if (!deployment) {
        throw new BadRequestException(
          'Немає активного переміщення для скасування',
        );
      }

      const previousStatus = deployment.status;
      deployment.status = 'cancelled';
      if (previousStatus !== 'planned') {
        deployment.arrivedAt = new Date();
      }

      this.restoreWeaponLocationAfterCancel(weapon, deployment);
      await manager.save(WeaponDeployment, deployment);
      await manager.save(WeaponSystem, weapon);
      await this.syncFirePositionWeaponStateWithManager(
        manager,
        deployment.fromLocationId,
      );
      await this.syncFirePositionWeaponStateWithManager(
        manager,
        deployment.toLocationId,
      );
      return { weapon, firePosition: null, deployment };
    });

    await this.writeDeploymentEvent(
      result.weapon,
      result.deployment,
      user,
      'cancelled',
    );
    this.emitWeaponChanged(
      'moved',
      result.weapon.id,
      this.firePositionIds(result.weapon, result.deployment),
    );
    return this.findOne(result.weapon.id, user);
  }

  async requestMaintenance(
    id: string,
    body: RequestMaintenanceDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    return this.openMaintenance(
      id,
      {
        reason: 'scheduled',
        startedAt: body.requestedStartAt,
        durationMinutes: body.durationMinutes,
        description: body.note,
      },
      user,
    );
  }

  async openMaintenance(
    id: string,
    body: OpenWeaponMaintenanceDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    this.ensureMaintenanceFieldOperator(user);
    const result = await this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      const previousReadinessStatus = weapon.readinessStatus;
      if (await getActiveMaintenance(this.dataSource, weapon.id, manager)) {
        throw new BadRequestException(
          'Для цієї СГ вже є активне ТО або ремонт',
        );
      }

      const reason = this.normalizeMaintenanceReason(body.reason);
      const startedAt = this.parseDate(body.startedAt);
      const durationMinutes = Number(body.durationMinutes ?? 0);
      const expectedCompletedAt = body.expectedCompletedAt
        ? this.parseDate(body.expectedCompletedAt)
        : Number.isFinite(durationMinutes) && durationMinutes > 0
          ? new Date(startedAt.getTime() + durationMinutes * 60_000)
          : null;

      const maintenance = manager.create(WeaponMaintenance, {
        weaponSystemId: weapon.id,
        reason,
        status: 'opened',
        startedAt,
        expectedCompletedAt,
        completedAt: null,
        description: body.description?.trim() || null,
        result: null,
        openedByUserId: user.sub,
      });

      weapon.readinessStatus = 'not_combat_ready';
      weapon.notReadyReason =
        reason === 'breakdown' ? 'breakdown' : 'maintenance';
      weapon.maintenanceStatus = 'opened';
      weapon.maintenanceRequestedStartAt = startedAt;
      weapon.maintenancePlannedEndAt = expectedCompletedAt;
      weapon.maintenanceActualEndAt = null;
      weapon.maintenanceNote = maintenance.description;
      weapon.maintenanceRequestedByUserId = user.sub;
      weapon.maintenanceApprovedByUserId = null;

      await manager.save(WeaponSystem, weapon);
      await manager.save(WeaponMaintenance, maintenance);
      return { weapon, previousReadinessStatus };
    });

    await this.writeMaintenanceEvent(result.weapon, user, 'opened');
    this.emitWeaponChanged('updated', result.weapon.id, [
      result.weapon.currentFirePositionId,
    ]);
    await this.operationalNotifications?.notifyWeaponReadinessTransition(
      result.previousReadinessStatus,
      result.weapon.id,
      user.sub,
    );
    return this.findOne(result.weapon.id, user);
  }

  async approveMaintenance(id: string, user: AuthUser): Promise<WeaponSystem> {
    return this.startMaintenance(id, user);
  }

  async startMaintenance(id: string, user: AuthUser): Promise<WeaponSystem> {
    this.ensureMaintenanceFieldOperator(user);
    const result = await this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      const maintenance = await getActiveMaintenance(
        this.dataSource,
        weapon.id,
        manager,
      );
      if (!maintenance) {
        throw new BadRequestException('Немає активного ТО або ремонту');
      }
      if (maintenance.status !== 'opened') {
        throw new BadRequestException('ТО або ремонт вже розпочато');
      }

      maintenance.status = 'in_progress';
      weapon.maintenanceStatus = 'in_progress';
      weapon.maintenanceApprovedByUserId = user.sub;
      await manager.save(WeaponMaintenance, maintenance);
      await manager.save(WeaponSystem, weapon);
      return weapon;
    });

    await this.writeMaintenanceEvent(result, user, 'started');
    this.emitWeaponChanged('updated', result.id, [
      result.currentFirePositionId,
    ]);
    return this.findOne(result.id, user);
  }

  async rejectMaintenance(id: string, user: AuthUser): Promise<WeaponSystem> {
    return this.cancelMaintenance(id, user);
  }

  async cancelMaintenance(id: string, user: AuthUser): Promise<WeaponSystem> {
    this.ensureMaintenanceFieldOperator(user);
    const result = await this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      const maintenance = await getActiveMaintenance(
        this.dataSource,
        weapon.id,
        manager,
      );
      if (!maintenance) {
        throw new BadRequestException('Немає активного ТО або ремонту');
      }

      maintenance.status = 'cancelled';
      maintenance.completedAt = new Date();
      weapon.maintenanceStatus = null;
      weapon.maintenanceActualEndAt = maintenance.completedAt;
      await manager.save(WeaponMaintenance, maintenance);
      await manager.save(WeaponSystem, weapon);
      return weapon;
    });

    await this.writeMaintenanceEvent(result, user, 'cancelled');
    this.emitWeaponChanged('updated', result.id, [
      result.currentFirePositionId,
    ]);
    return this.findOne(result.id, user);
  }

  async extendMaintenance(
    id: string,
    body: ExtendMaintenanceDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const result = await this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      const maintenance = await getActiveMaintenance(
        this.dataSource,
        weapon.id,
        manager,
      );
      if (!maintenance) {
        throw new BadRequestException('Немає активного ТО або ремонту');
      }

      if (maintenance.status !== 'in_progress') {
        throw new BadRequestException('ТО ще не розпочато');
      }

      const extraMinutes = Number(body.extraMinutes ?? 0);
      if (!Number.isFinite(extraMinutes) || extraMinutes <= 0) {
        throw new BadRequestException('Вкажіть час продовження ТО');
      }

      const baseEnd = maintenance.expectedCompletedAt ?? new Date();
      maintenance.expectedCompletedAt = new Date(
        baseEnd.getTime() + extraMinutes * 60_000,
      );
      maintenance.description =
        [maintenance.description, body.note?.trim()]
          .filter(Boolean)
          .join('\n') || null;
      weapon.maintenancePlannedEndAt = maintenance.expectedCompletedAt;
      weapon.maintenanceNote = maintenance.description;
      await manager.save(WeaponMaintenance, maintenance);
      await manager.save(WeaponSystem, weapon);
      return weapon;
    });

    await this.writeMaintenanceEvent(result, user, 'extended');
    this.emitWeaponChanged('updated', result.id, [
      result.currentFirePositionId,
    ]);
    return this.findOne(result.id, user);
  }

  async finishMaintenance(id: string, user: AuthUser): Promise<WeaponSystem> {
    return this.completeMaintenance(id, {}, user);
  }

  async completeMaintenance(
    id: string,
    body: CompleteWeaponMaintenanceDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    this.ensureMaintenanceFieldOperator(user);
    const result = await this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      const maintenance = await getActiveMaintenance(
        this.dataSource,
        weapon.id,
        manager,
      );
      if (!maintenance) {
        throw new BadRequestException('Немає активного ТО або ремонту');
      }

      if (maintenance.status !== 'in_progress') {
        throw new BadRequestException('ТО ще не розпочато');
      }

      maintenance.status = 'completed';
      maintenance.completedAt = new Date();
      maintenance.completedByUserId = user.sub;
      maintenance.result = body.result?.trim() || null;
      weapon.maintenanceStatus = null;
      weapon.maintenanceActualEndAt = maintenance.completedAt;
      weapon.maintenanceNote = maintenance.result ?? weapon.maintenanceNote;
      weapon.readinessStatus = 'not_combat_ready';
      weapon.notReadyReason = weapon.notReadyReason ?? 'maintenance';
      await manager.save(WeaponMaintenance, maintenance);
      await manager.save(WeaponSystem, weapon);
      return weapon;
    });

    await this.writeMaintenanceEvent(result, user, 'completed');
    this.emitWeaponChanged('updated', result.id, [
      result.currentFirePositionId,
    ]);
    return this.findOne(result.id, user);
  }

  async confirmReadiness(
    id: string,
    body: ConfirmWeaponReadinessDto,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    this.ensureMaintenanceFieldOperator(user);
    const item = await this.findOne(id, user);
    if (
      this.normalizeWeaponReadiness(body.readinessStatus) ===
        'combat_ready' &&
      (await getActiveMaintenance(this.dataSource, item.id))
    ) {
      throw new BadRequestException(
        'Неможливо підтвердити БГ під час активного ТО або ремонту',
      );
    }
    const previousReadinessStatus = item.readinessStatus;
    item.readinessStatus = this.normalizeWeaponReadiness(body.readinessStatus);
    item.notReadyReason = this.normalizeWeaponReason(
      body.notReadyReason ?? null,
      item.readinessStatus as WeaponReadinessStatus,
    );
    const saved = await this.repository.save(item);
    await this.writeWeaponEvent(saved, user, 'updated');
    this.emitWeaponChanged('updated', saved.id, [saved.currentFirePositionId]);
    await this.operationalNotifications?.notifyWeaponReadinessTransition(
      previousReadinessStatus,
      saved.id,
      user.sub,
    );
    return this.findOne(saved.id, user);
  }

  async syncAllFirePositionStates(
    user: AuthUser,
  ): Promise<{ updated: number }> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    const firePositionRepository = this.dataSource.getRepository(FirePosition);

    const firePositions = await firePositionRepository.find({
      where: allowedUnitIds === null ? {} : { unitId: In(allowedUnitIds) },
      select: { id: true },
    });

    for (const firePosition of firePositions) {
      await this.syncFirePositionWeaponState(firePosition.id);
    }

    this.emitWeaponChanged(
      'synced',
      undefined,
      firePositions.map((position) => position.id),
    );
    return { updated: firePositions.length };
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    let item: WeaponSystem;
    try {
      item = await this.dataSource.transaction(async (manager) => {
        const locked = await this.lockWeapon(
          manager.getRepository(WeaponSystem),
          id,
          user,
        );
        if (await this.hasHistoricalReferences(locked.id, manager)) {
          throw new ConflictException(
            'СГ використовується в історії ВГЗ і не може бути видалена. Архівуйте її.',
          );
        }
        await manager.remove(WeaponSystem, locked);
        return locked;
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ConflictException(
        'СГ використовується в історії ВГЗ і не може бути видалена. Архівуйте її.',
      );
    }

    const previousFirePositionId =
      item.currentFirePositionId ?? item.firePositionId;
    await this.syncFirePositionWeaponState(previousFirePositionId);
    await this.writeWeaponEvent(item, user, 'deleted');
    this.emitWeaponChanged('deleted', item.id, [previousFirePositionId]);
  }

  async archive(id: string, user: AuthUser): Promise<WeaponSystem> {
    const item = await this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      if (weapon.isArchived) {
        return weapon;
      }
      weapon.isArchived = true;
      weapon.archivedAt = new Date();
      weapon.archivedByUserId = user.sub;
      return manager.save(WeaponSystem, weapon);
    });

    await this.writeWeaponEvent(item, user, 'updated');
    this.emitWeaponChanged('updated', item.id, [item.currentFirePositionId]);
    return this.findOne(item.id, user);
  }

  private async planDeployment(
    id: string,
    toLocationType: DeploymentLocationType,
    toLocationId: string | null | undefined,
    _force: boolean,
    note: string | null | undefined,
    user: AuthUser,
  ): Promise<WeaponDeploymentContext> {
    return this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      this.ensureWeaponCanStartDeployment(weapon);

      const firePosition =
        toLocationType === 'fire_position'
          ? await this.loadTargetFirePosition(manager, toLocationId)
          : null;

      if (toLocationType === 'fire_position') {
        await this.prepareFirePositionForWeapon(
          manager,
          firePosition!,
          weapon,
          user,
        );
        this.ensureWeaponCombatReadyForAssignment(weapon);
        await this.ensureFirePositionAvailable(
          manager,
          firePosition!.id,
          weapon.id,
        );
      } else {
        await this.ensureNoActiveExecution(
          manager,
          weapon.currentFirePositionId,
        );
      }

      await this.ensureNoMutableDeployment(
        manager.getRepository(WeaponDeployment),
        weapon.id,
      );

      const deployment = manager.create(WeaponDeployment, {
        weaponSystemId: weapon.id,
        fromLocationType: this.getCurrentLocationType(weapon),
        fromLocationId: weapon.currentFirePositionId ?? null,
        toLocationType,
        toLocationId: firePosition?.id ?? null,
        status: 'planned',
        orderedAt: new Date(),
        orderedByUserId: user.sub,
        note: note?.trim() || null,
      });

      const savedDeployment = await manager.save(WeaponDeployment, deployment);
      return { weapon, firePosition, deployment: savedDeployment };
    });
  }

  private async startDeployment(
    id: string,
    toLocationType: DeploymentLocationType,
    body: CreateWeaponDeploymentDto | UpdateWeaponDeploymentDto,
    user: AuthUser,
  ): Promise<WeaponDeploymentContext> {
    return this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      this.ensureWeaponCanStartDeployment(weapon);
      const deployment =
        (await this.findMutableDeployment(
          manager.getRepository(WeaponDeployment),
          weapon.id,
          toLocationType,
        )) ??
        (
          await this.planDeployment(
            id,
            toLocationType,
            'targetFirePositionId' in body
              ? (body.targetFirePositionId ?? body.firePositionId)
              : null,
            'force' in body && body.force === true,
            body.note,
            user,
          )
        ).deployment;

      if (deployment.status !== 'planned') {
        throw new BadRequestException(
          'Переміщення вже розпочато або завершено',
        );
      }

      const firePosition =
        deployment.toLocationType === 'fire_position'
          ? await this.loadTargetFirePosition(manager, deployment.toLocationId)
          : null;

      if (deployment.toLocationType === 'fire_position') {
        await this.prepareFirePositionForWeapon(
          manager,
          firePosition!,
          weapon,
          user,
        );
        await this.ensureFirePositionAvailable(
          manager,
          firePosition!.id,
          weapon.id,
        );
      } else {
        await this.ensureNoActiveExecution(
          manager,
          weapon.currentFirePositionId,
        );
      }

      deployment.status = 'moving';
      deployment.departedAt = new Date();
      weapon.deploymentStatus =
        deployment.toLocationType === 'fire_position'
          ? 'moving_to_fire_position'
          : 'moving_to_reserve_area';
      weapon.currentFirePositionId = null;

      const savedDeployment = await manager.save(WeaponDeployment, deployment);
      await manager.save(WeaponSystem, weapon);
      await this.syncFirePositionWeaponStateWithManager(
        manager,
        deployment.fromLocationId,
      );
      return { weapon, firePosition, deployment: savedDeployment };
    });
  }

  private async arriveAtFirePosition(
    id: string,
    targetFirePositionId: string | null | undefined,
    allowImmediate: boolean,
    user: AuthUser,
    body: CreateWeaponDeploymentDto | AssignWeaponToFirePositionDto,
  ): Promise<WeaponDeploymentContext> {
    return this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      const deploymentRepository = manager.getRepository(WeaponDeployment);
      const mutableDeployment = await this.findMutableDeployment(
        deploymentRepository,
        weapon.id,
        'fire_position',
      );
      const targetId = targetFirePositionId ?? mutableDeployment?.toLocationId;
      const firePosition = await this.loadTargetFirePosition(manager, targetId);
      if (!mutableDeployment) {
        this.ensureWeaponCanStartDeployment(weapon);
      }

      await this.prepareFirePositionForWeapon(
        manager,
        firePosition,
        weapon,
        user,
      );

      if (
        weapon.deploymentStatus === 'at_fire_position' &&
        weapon.currentFirePositionId === firePosition.id
      ) {
        const deployment = await this.ensureArrivedDeployment(
          manager,
          weapon,
          firePosition.id,
          user,
          this.getDeploymentNote(body),
        );
        return { weapon, firePosition, deployment };
      }

      if (
        weapon.deploymentStatus === 'at_fire_position' &&
        weapon.currentFirePositionId &&
        weapon.currentFirePositionId !== firePosition.id
      ) {
        throw new BadRequestException(
          'СГ вже перебуває на іншій ВП. Спочатку виведіть її в РЗ',
        );
      }

      this.ensureWeaponCombatReadyForAssignment(weapon);
      await this.ensureFirePositionAvailable(
        manager,
        firePosition.id,
        weapon.id,
      );

      const deployment =
        mutableDeployment ??
        manager.create(WeaponDeployment, {
          weaponSystemId: weapon.id,
          fromLocationType: this.getCurrentLocationType(weapon),
          fromLocationId: weapon.currentFirePositionId ?? null,
          toLocationType: 'fire_position',
          toLocationId: firePosition.id,
          status: allowImmediate ? 'moving' : 'planned',
          orderedAt: new Date(),
          departedAt: allowImmediate ? new Date() : null,
          orderedByUserId: user.sub,
          note: this.getDeploymentNote(body),
        });

      if (!allowImmediate && deployment.status !== 'moving') {
        throw new BadRequestException(
          'Спочатку потрібно розпочати переміщення до ВП',
        );
      }

      deployment.status = 'arrived';
      deployment.toLocationId = firePosition.id;
      deployment.arrivedAt = new Date();
      deployment.confirmedByUserId = user.sub;
      weapon.deploymentStatus = 'at_fire_position';
      weapon.currentFirePositionId = firePosition.id;
      weapon.unitId = weapon.unitId ?? firePosition.unitId;
      firePosition.unitId = weapon.unitId ?? firePosition.unitId;

      const savedDeployment = await manager.save(WeaponDeployment, deployment);
      await manager.save(FirePosition, firePosition);
      await manager.save(WeaponSystem, weapon);
      await this.syncFirePositionWeaponStateWithManager(
        manager,
        firePosition.id,
      );
      await this.syncFirePositionWeaponStateWithManager(
        manager,
        deployment.fromLocationId,
      );
      return { weapon, firePosition, deployment: savedDeployment };
    });
  }

  private async arriveAtReserve(
    id: string,
    allowImmediate: boolean,
    user: AuthUser,
    body: UpdateWeaponDeploymentDto,
  ): Promise<WeaponDeploymentContext> {
    return this.dataSource.transaction(async (manager) => {
      const weapon = await this.lockWeapon(
        manager.getRepository(WeaponSystem),
        id,
        user,
      );
      const previousFirePositionId =
        weapon.currentFirePositionId ?? weapon.firePositionId;
      await this.ensureNoActiveExecution(manager, previousFirePositionId);

      const deploymentRepository = manager.getRepository(WeaponDeployment);
      const mutableDeployment = await this.findMutableDeployment(
        deploymentRepository,
        weapon.id,
        'reserve_area',
      );

      const deployment =
        mutableDeployment ??
        manager.create(WeaponDeployment, {
          weaponSystemId: weapon.id,
          fromLocationType: this.getCurrentLocationType(weapon),
          fromLocationId: previousFirePositionId,
          toLocationType: 'reserve_area',
          toLocationId: null,
          status: allowImmediate ? 'moving' : 'planned',
          orderedAt: new Date(),
          departedAt: allowImmediate ? new Date() : null,
          orderedByUserId: user.sub,
          note: body.note?.trim() || null,
        });

      if (!allowImmediate && deployment.status !== 'moving') {
        throw new BadRequestException(
          'Спочатку потрібно розпочати переміщення до РЗ',
        );
      }

      deployment.status = 'arrived';
      deployment.arrivedAt = new Date();
      deployment.confirmedByUserId = user.sub;
      weapon.deploymentStatus = 'reserve_area';
      weapon.currentFirePositionId = null;

      const savedDeployment = await manager.save(WeaponDeployment, deployment);
      await manager.save(WeaponSystem, weapon);
      await this.syncFirePositionWeaponStateWithManager(
        manager,
        previousFirePositionId,
      );
      return { weapon, firePosition: null, deployment: savedDeployment };
    });
  }

  private async lockWeapon(
    repository: Repository<WeaponSystem>,
    id: string,
    user: AuthUser,
  ): Promise<WeaponSystem> {
    const locked = await repository.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!locked) {
      throw new NotFoundException('СГ не знайдено');
    }

    const item = await repository.findOne({
      where: { id: locked.id },
      relations: this.weaponRelations(),
    });

    if (!item) {
      throw new NotFoundException('СГ не знайдено');
    }

    await this.ensureCanUseUnit(user, item.unitId);
    return item;
  }

  private async loadTargetFirePosition(
    manager: DataSource['manager'],
    firePositionId: string | null | undefined,
  ): Promise<FirePosition> {
    if (!firePositionId) {
      throw new BadRequestException('Потрібно вибрати ВП');
    }

    const firePosition = await manager.getRepository(FirePosition).findOne({
      where: { id: firePositionId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!firePosition) {
      throw new BadRequestException('ВП не знайдено');
    }

    return firePosition;
  }

  private async prepareFirePositionForWeapon(
    manager: DataSource['manager'],
    firePosition: FirePosition,
    weapon: WeaponSystem,
    user: AuthUser,
  ): Promise<void> {
    if (firePosition.unitId) {
      await this.ensureCanUseUnit(user, firePosition.unitId);

      if (weapon.unitId && firePosition.unitId !== weapon.unitId) {
        throw new ConflictException('ВП належить іншому підрозділу');
      }

      return;
    }

    if (!weapon.unitId) {
      throw new BadRequestException(
        'ВП не має підрозділу, а СГ не прив’язана до підрозділу',
      );
    }

    await this.ensureCanUseUnit(user, weapon.unitId);

    const assignedWeapon = await manager.getRepository(WeaponSystem).findOne({
      where: [
        {
          currentFirePositionId: firePosition.id,
          deploymentStatus: 'at_fire_position',
          id: Not(weapon.id),
        },
        {
          firePositionId: firePosition.id,
          locationType: 'fire_position',
          id: Not(weapon.id),
        },
      ],
      select: { id: true },
    });

    if (assignedWeapon) {
      throw new ConflictException('ВП вже має призначену СГ');
    }

    firePosition.unitId = weapon.unitId;
    await manager.save(FirePosition, firePosition);
  }

  private async ensureFirePositionAvailable(
    manager: DataSource['manager'],
    firePositionId: string,
    weaponId: string,
  ): Promise<void> {
    const occupied = await manager.getRepository(WeaponSystem).findOne({
      where: {
        currentFirePositionId: firePositionId,
        deploymentStatus: 'at_fire_position',
        id: Not(weaponId),
      },
      lock: { mode: 'pessimistic_read' },
    });

    if (occupied) {
      throw new BadRequestException('ВП вже зайнята іншою СГ');
    }
  }

  private async ensureNoActiveExecution(
    manager: DataSource['manager'],
    firePositionId: string | null,
  ): Promise<void> {
    if (!firePositionId) {
      return;
    }

    const activeOrder = await manager.getRepository(ServiceOrder).findOne({
      where: {
        selectedFirePositionId: firePositionId,
        status: In(ACTIVE_ORDER_STATUSES),
      },
      select: { id: true },
    });

    if (activeOrder) {
      throw new BadRequestException(
        'Неможливо вивести СГ під час активного виконання',
      );
    }
  }

  private async ensureNoOpenMaintenance(
    repository: Repository<WeaponMaintenance>,
    weaponSystemId: string,
  ): Promise<void> {
    const existing = await repository.findOne({
      where: {
        weaponSystemId,
        status: In(['opened', 'in_progress']),
      },
    });

    if (existing) {
      throw new BadRequestException('Для цієї СГ вже є активне ТО або ремонт');
    }
  }

  private async findOpenMaintenance(
    repository: Repository<WeaponMaintenance>,
    weaponSystemId: string,
  ): Promise<WeaponMaintenance> {
    const maintenance = await repository.findOne({
      where: {
        weaponSystemId,
        status: In(['opened', 'in_progress']),
      },
      order: { createdAt: 'DESC' },
    });

    if (!maintenance) {
      throw new BadRequestException('Немає активного ТО або ремонту');
    }

    return maintenance;
  }

  private async ensureNoMutableDeployment(
    repository: Repository<WeaponDeployment>,
    weaponSystemId: string,
  ): Promise<void> {
    const existing = await repository.findOne({
      where: {
        weaponSystemId,
        status: In(['planned', 'moving']),
      },
    });

    if (existing) {
      throw new BadRequestException('Для цієї СГ вже є активне переміщення');
    }
  }

  private async findMutableDeployment(
    repository: Repository<WeaponDeployment>,
    weaponSystemId: string,
    toLocationType: DeploymentLocationType | null,
  ): Promise<WeaponDeployment | null> {
    return repository.findOne({
      where: {
        weaponSystemId,
        status: In(['planned', 'moving']),
        ...(toLocationType ? { toLocationType } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  private async ensureArrivedDeployment(
    manager: DataSource['manager'],
    weapon: WeaponSystem,
    firePositionId: string,
    user: AuthUser,
    note: string | null | undefined,
  ): Promise<WeaponDeployment> {
    const existing = await manager.getRepository(WeaponDeployment).findOne({
      where: {
        weaponSystemId: weapon.id,
        toLocationType: 'fire_position',
        toLocationId: firePositionId,
        status: 'arrived',
      },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      return existing;
    }

    return manager.save(
      WeaponDeployment,
      manager.create(WeaponDeployment, {
        weaponSystemId: weapon.id,
        fromLocationType: 'fire_position',
        fromLocationId: firePositionId,
        toLocationType: 'fire_position',
        toLocationId: firePositionId,
        status: 'arrived',
        orderedAt: new Date(),
        departedAt: new Date(),
        arrivedAt: new Date(),
        orderedByUserId: user.sub,
        confirmedByUserId: user.sub,
        note: note?.trim() || null,
      }),
    );
  }

  private async syncFirePositionWeaponState(
    firePositionId: string | null,
  ): Promise<void> {
    await this.syncFirePositionWeaponStateWithManager(
      this.dataSource.manager,
      firePositionId,
    );
  }

  private async syncFirePositionWeaponStateWithManager(
    manager: DataSource['manager'],
    firePositionId: string | null,
  ): Promise<void> {
    if (!firePositionId) {
      return;
    }

    const weapon = await manager.getRepository(WeaponSystem).findOne({
      where: {
        currentFirePositionId: firePositionId,
        deploymentStatus: 'at_fire_position',
      },
      order: { updatedAt: 'DESC' },
    });

    await manager.getRepository(FirePosition).update(firePositionId, {
      hasSg: !!weapon,
      unitId: weapon?.unitId ?? null,
    });
  }

  private restoreWeaponLocationAfterCancel(
    weapon: WeaponSystem,
    deployment: WeaponDeployment,
  ): void {
    if (
      deployment.fromLocationType === 'fire_position' &&
      deployment.fromLocationId
    ) {
      weapon.deploymentStatus = 'at_fire_position';
      weapon.currentFirePositionId = deployment.fromLocationId;
      return;
    }

    weapon.deploymentStatus = 'reserve_area';
    weapon.currentFirePositionId = null;
  }

  private rejectDirectLocationMutation(
    data: Partial<CreateWeaponSystemDto & UpdateWeaponSystemDto>,
    current: WeaponSystem | null,
  ): void {
    const requestedFirePositionId =
      data.currentFirePositionId ?? data.firePositionId ?? null;
    const requestedDeployment = this.normalizeDeploymentInput(
      data.deploymentStatus,
      data.locationType,
      requestedFirePositionId,
    );

    if (!current) {
      if (requestedFirePositionId || requestedDeployment !== 'reserve_area') {
        throw new BadRequestException(
          'Переміщення СГ виконується окремою дією',
        );
      }
      return;
    }

    const currentFirePositionId =
      current.currentFirePositionId ?? current.firePositionId ?? null;
    const currentDeployment = this.normalizeDeploymentInput(
      current.deploymentStatus,
      current.locationType,
      currentFirePositionId,
    );

    if (
      requestedFirePositionId !== null &&
      requestedFirePositionId !== currentFirePositionId
    ) {
      throw new BadRequestException('Переміщення СГ виконується окремою дією');
    }

    if (
      data.deploymentStatus !== undefined &&
      requestedDeployment !== currentDeployment
    ) {
      throw new BadRequestException('Переміщення СГ виконується окремою дією');
    }

    if (
      data.locationType !== undefined &&
      this.normalizeDeploymentInput(
        undefined,
        data.locationType,
        requestedFirePositionId,
      ) !== currentDeployment
    ) {
      throw new BadRequestException('Переміщення СГ виконується окремою дією');
    }
  }

  private normalizeDeploymentInput(
    deploymentStatus: string | null | undefined,
    locationType: string | null | undefined,
    firePositionId: string | null,
  ): DeploymentStatus {
    if (
      deploymentStatus === 'reserve_area' ||
      deploymentStatus === 'moving_to_fire_position' ||
      deploymentStatus === 'at_fire_position' ||
      deploymentStatus === 'moving_to_reserve_area'
    ) {
      return deploymentStatus;
    }

    if (locationType === 'fire_position' || firePositionId) {
      return 'at_fire_position';
    }

    return 'reserve_area';
  }

  private normalizeWeaponReadiness(
    value: string | null | undefined,
  ): WeaponReadinessStatus {
    return value === 'ready' ||
      value === 'combat_ready' ||
      value === 'ready_for_combat'
      ? 'combat_ready'
      : 'not_combat_ready';
  }

  private normalizeWeaponReason(
    value: string | null | undefined,
    readinessStatus: WeaponReadinessStatus,
  ): WeaponNotReadyReason | null {
    if (readinessStatus === 'combat_ready') {
      return null;
    }

    if (
      value === 'breakdown' ||
      value === 'air_threat' ||
      value === 'crew' ||
      value === 'maintenance' ||
      value === 'other'
    ) {
      return value;
    }

    return 'other';
  }

  private normalizeMaintenanceReason(
    value: string | null | undefined,
  ): MaintenanceReason {
    if (
      value === 'breakdown' ||
      value === 'scheduled' ||
      value === 'inspection' ||
      value === 'other'
    ) {
      return value;
    }

    return 'breakdown';
  }

  private ensureWeaponCombatReadyForAssignment(weapon: WeaponSystem): void {
    if (
      this.normalizeWeaponReadiness(weapon.readinessStatus) === 'combat_ready'
    ) {
      return;
    }

    throw new BadRequestException(
      'СГ НЕ БГ і не може бути призначена на ВП. Спочатку явно відновіть БГ.',
    );
  }

  private ensureWeaponCanStartDeployment(weapon: WeaponSystem): void {
    if (this.hasActiveMaintenance(weapon)) {
      throw new BadRequestException(
        'Неможливо переміщувати СГ під час активного ТО або ремонту',
      );
    }

    if (
      weapon.deploymentStatus === 'moving_to_fire_position' ||
      weapon.deploymentStatus === 'moving_to_reserve_area'
    ) {
      throw new BadRequestException('СГ вже в русі');
    }
  }

  private hasActiveMaintenance(weapon: WeaponSystem): boolean {
    return activeMaintenanceFromHistory(weapon.maintenances) !== null;
  }

  private getCurrentLocationType(weapon: WeaponSystem): DeploymentLocationType {
    return weapon.currentFirePositionId ||
      weapon.locationType === 'fire_position'
      ? 'fire_position'
      : 'reserve_area';
  }

  private parseDate(value: string | undefined): Date {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Некоректний час початку ТО');
    }
    return date;
  }

  private getDeploymentNote(
    body:
      | CreateWeaponDeploymentDto
      | AssignWeaponToFirePositionDto
      | UpdateWeaponDeploymentDto,
  ): string | null {
    return 'note' in body ? body.note?.trim() || null : null;
  }

  private weaponRelations() {
    return {
      unit: true,
      weaponModel: true,
      firePosition: true,
      currentFirePosition: true,
      maintenances: true,
      deployments: true,
    };
  }

  private async decorateWeaponResponses(
    items: WeaponSystem[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const referencedRows = await this.dataSource.query(
      `
        SELECT DISTINCT weapon_system_id
        FROM (
          SELECT selected_weapon_system_id AS weapon_system_id
          FROM service_order_deliveries
          WHERE selected_weapon_system_id = ANY($1::uuid[])
          UNION ALL
          SELECT weapon_system_id FROM fire_missions
          WHERE weapon_system_id = ANY($1::uuid[])
          UNION ALL
          SELECT weapon_system_id FROM fire_position_weapons
          WHERE weapon_system_id = ANY($1::uuid[])
          UNION ALL
          SELECT weapon_system_id FROM weapon_deployments
          WHERE weapon_system_id = ANY($1::uuid[])
          UNION ALL
          SELECT weapon_system_id FROM weapon_maintenances
          WHERE weapon_system_id = ANY($1::uuid[])
        ) reference_rows
      `,
      [items.map((item) => item.id)],
    );
    const referencedIds = new Set(
      (Array.isArray(referencedRows) ? referencedRows : []).map(
        (row: { weapon_system_id: string }) => row.weapon_system_id,
      ),
    );

    for (const item of items) {
      const activeMaintenance = activeMaintenanceFromHistory(
        item.maintenances,
      );
      item.activeMaintenance = activeMaintenance;
      item.maintenanceStatus = activeMaintenance?.status ?? null;
      item.hasHistoricalReferences = referencedIds.has(item.id);
    }
  }

  private async hasHistoricalReferences(
    weaponId: string,
    manager: DataSource['manager'],
  ): Promise<boolean> {
    const rows = await manager.query(
      `
        SELECT EXISTS (
          SELECT 1 FROM service_order_deliveries
          WHERE selected_weapon_system_id = $1
          UNION ALL
          SELECT 1 FROM fire_missions WHERE weapon_system_id = $1
          UNION ALL
          SELECT 1 FROM fire_position_weapons WHERE weapon_system_id = $1
          UNION ALL
          SELECT 1 FROM weapon_deployments WHERE weapon_system_id = $1
          UNION ALL
          SELECT 1 FROM weapon_maintenances WHERE weapon_system_id = $1
        ) AS referenced
      `,
      [weaponId],
    );
    return rows?.[0]?.referenced === true;
  }

  private async ensureCanUseUnit(
    user: AuthUser,
    unitId: string | null,
  ): Promise<void> {
    if (!unitId) {
      throw new ForbiddenException('Потрібно обрати підрозділ');
    }

    const canAccess = await this.accessScope.canAccessUnit(user, unitId);
    if (!canAccess) {
      throw new ForbiddenException('Немає доступу до СГ цього підрозділу');
    }
  }

  private ensureMainOperator(user: AuthUser): void {
    if (user.role === 'admin') {
      return;
    }

    if (user.role === 'operator' && user.scope === 'main') {
      return;
    }

    throw new ForbiddenException(
      'Підтвердити ТО може тільки головний оператор',
    );
  }

  private ensureMaintenanceFieldOperator(user: AuthUser): void {
    if (user.role === 'admin') {
      return;
    }

    if (
      user.role === 'operator' &&
      (user.scope === 'battery' ||
        user.scope === 'division' ||
        user.scope === 'main')
    ) {
      return;
    }

    throw new ForbiddenException(
      'Операції з ТО може виконувати тільки оператор',
    );
  }

  private emitWeaponChanged(
    action: 'created' | 'updated' | 'deleted' | 'moved' | 'synced' = 'moved',
    id?: string,
    firePositionIds: Array<string | null | undefined> = [],
  ): void {
    this.realtimeEvents.emitMany(
      ['weapons', 'map', 'analytics', 'events'],
      action,
      {
        entity: 'weapon_system',
        id,
      },
    );
    const uniqueFirePositionIds = new Set(
      firePositionIds.filter((value): value is string => !!value),
    );
    for (const firePositionId of uniqueFirePositionIds) {
      this.realtimeEvents.emit('map', action, {
        entity: 'fire_position',
        id: firePositionId,
        reason: 'weapon_state_changed',
      });
    }
  }

  private firePositionIds(
    weapon: WeaponSystem,
    deployment: WeaponDeployment,
  ): Array<string | null | undefined> {
    return [
      weapon.currentFirePositionId,
      deployment.fromLocationType === 'fire_position'
        ? deployment.fromLocationId
        : null,
      deployment.toLocationType === 'fire_position'
        ? deployment.toLocationId
        : null,
    ];
  }

  private async writeWeaponEvent(
    weapon: WeaponSystem,
    user: AuthUser,
    action: WeaponEventAction,
  ): Promise<void> {
    const titles: Record<WeaponEventAction, string> = {
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
      details: `${user.fullName || user.login}: ${titles[action]} ${
        weapon.callsign || weapon.serialNumber || ''
      }`,
    });
  }

  private async writeMaintenanceEvent(
    weapon: WeaponSystem,
    user: AuthUser,
    action: MaintenanceEventAction,
  ): Promise<void> {
    const titles: Record<MaintenanceEventAction, string> = {
      opened: 'Відкрито ТО СГ',
      started: 'ТО СГ розпочато',
      cancelled: 'ТО СГ скасовано',
      extended: 'ТО СГ продовжено',
      completed: 'ТО СГ завершено',
    };

    await this.eventLogs.create({
      eventType: 'weapon_maintenance',
      action,
      actor: user,
      unitId: weapon.unitId,
      unitName: weapon.unit?.name ?? null,
      entityType: 'weapon_system',
      entityId: weapon.id,
      entityName: weapon.callsign || weapon.serialNumber || 'СГ',
      title: titles[action],
      details: `${user.fullName || user.login}: ${titles[action]} ${
        weapon.callsign || weapon.serialNumber || ''
      }`,
    });
  }

  private async writeDeploymentEvent(
    weapon: WeaponSystem,
    deployment: WeaponDeployment,
    user: AuthUser,
    action: DeploymentEventAction,
  ): Promise<void> {
    const titles: Record<DeploymentEventAction, string> = {
      planned: 'Заплановано переміщення СГ',
      started: 'СГ вирушила',
      arrived: 'СГ прибула',
      cancelled: 'Переміщення СГ скасовано',
    };

    await this.eventLogs.create({
      eventType: 'weapon_deployment',
      action,
      actor: user,
      unitId: weapon.unitId,
      unitName: weapon.unit?.name ?? null,
      entityType: 'weapon_deployment',
      entityId: deployment.id,
      entityName: weapon.callsign || weapon.serialNumber || 'СГ',
      title: titles[action],
      details: `${user.fullName || user.login}: ${titles[action]} ${
        weapon.callsign || weapon.serialNumber || ''
      }`,
    });
  }
}
