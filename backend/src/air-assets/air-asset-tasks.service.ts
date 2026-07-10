import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { AirAssetDroneStock } from '../drone-logistics/air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from '../drone-logistics/air-asset-warhead-stock.entity';
import { EventLogsService } from '../event-logs/event-logs.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { AirAssetPosition } from './air-asset-position.entity';
import { AirAssetTaskPoint } from './air-asset-task-point.entity';
import { AirAssetTask } from './air-asset-task.entity';
import { UpsertAirAssetTaskDto } from './dto/upsert-air-asset-task.dto';

@Injectable()
export class AirAssetTasksService {
  constructor(
    @InjectRepository(AirAssetTask)
    private readonly tasks: Repository<AirAssetTask>,
    @InjectRepository(AirAssetPosition)
    private readonly assets: Repository<AirAssetPosition>,
    @InjectRepository(AirAssetDroneStock)
    private readonly droneStock: Repository<AirAssetDroneStock>,
    @InjectRepository(AirAssetWarheadStock)
    private readonly warheadStock: Repository<AirAssetWarheadStock>,
    private readonly accessScope: AccessScopeService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly eventLogs: EventLogsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(user: AuthUser): Promise<AirAssetTask[]> {
    await this.ensureSchema();
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) return [];

    return this.tasks.find({
      where: allowedUnitIds === null ? {} : { unitId: In(allowedUnitIds) },
      relations: { unit: true, airAssetPosition: true, droneModel: true, warheadType: true, points: true },
      order: { plannedStartAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async create(data: UpsertAirAssetTaskDto, user: AuthUser): Promise<AirAssetTask> {
    await this.ensureSchema();
    const asset = await this.getTaskAsset(data, user);
    const normalized = await this.normalizeBody(data, asset);

    const saved = await this.dataSource.transaction(async (manager) => {
      const task = manager.create(AirAssetTask, {
        taskType: normalized.taskType,
        name: normalized.name,
        unitId: asset.unitId,
        airAssetPositionId: asset.id,
        droneModelId: normalized.droneModelId,
        warheadTypeId: normalized.warheadTypeId,
        areaName: normalized.areaName,
        plannedStartAt: normalized.plannedStartAt,
        plannedEndAt: normalized.plannedEndAt,
        status: normalized.status,
        note: normalized.note,
        points: normalized.points.map((point, index) =>
          manager.create(AirAssetTaskPoint, {
            pointOrder: index + 1,
            lat: point.lat,
            lng: point.lng,
          }),
        ),
      });

      return manager.save(AirAssetTask, task);
    });

    const full = await this.findOne(saved.id, user);
    await this.writeTaskEvent(full, user, 'created');
    this.emitChanged('created', full.id, full.unitId);
    return full;
  }

  async update(id: string, data: UpsertAirAssetTaskDto, user: AuthUser): Promise<AirAssetTask> {
    await this.ensureSchema();
    const existing = await this.findOne(id, user);
    const asset = await this.getTaskAsset(data, user);
    const normalized = await this.normalizeBody(data, asset);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(AirAssetTaskPoint, { taskId: existing.id });
      await manager.update(AirAssetTask, existing.id, {
        taskType: normalized.taskType,
        name: normalized.name,
        unitId: asset.unitId,
        airAssetPositionId: asset.id,
        droneModelId: normalized.droneModelId,
        warheadTypeId: normalized.warheadTypeId,
        areaName: normalized.areaName,
        plannedStartAt: normalized.plannedStartAt,
        plannedEndAt: normalized.plannedEndAt,
        status: normalized.status,
        note: normalized.note,
      });
      await manager.save(
        AirAssetTaskPoint,
        normalized.points.map((point, index) =>
          manager.create(AirAssetTaskPoint, {
            taskId: existing.id,
            pointOrder: index + 1,
            lat: point.lat,
            lng: point.lng,
          }),
        ),
      );
    });

    const full = await this.findOne(existing.id, user);
    await this.writeTaskEvent(full, user, 'updated');
    this.emitChanged('updated', full.id, full.unitId);
    return full;
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const task = await this.findOne(id, user);
    await this.tasks.remove(task);
    await this.writeTaskEvent(task, user, 'deleted');
    this.emitChanged('deleted', task.id, task.unitId);
  }

  private async findOne(id: string, user: AuthUser): Promise<AirAssetTask> {
    const task = await this.tasks.findOne({
      where: { id },
      relations: { unit: true, airAssetPosition: true, droneModel: true, warheadType: true, points: true },
    });

    if (!task) throw new NotFoundException('Задачу не знайдено');
    await this.ensureCanUseUnit(user, task.unitId);
    return task;
  }

  private async getTaskAsset(data: UpsertAirAssetTaskDto, user: AuthUser): Promise<AirAssetPosition> {
    this.ensureUserCanManageAirAssets(user);

    const asset = await this.assets.findOne({
      where: { id: data.airAssetPositionId },
      relations: { unit: true },
    });

    if (!asset) throw new NotFoundException('Повітряний розрахунок не знайдено');
    await this.ensureCanUseUnit(user, asset.unitId);

    if (data.taskType === 'recon' && asset.assetGroup !== 'recon') {
      throw new BadRequestException('Задачу на розвідку можна дати тільки розвідувальному розрахунку');
    }

    if (data.taskType === 'combat' && asset.assetGroup !== 'combat') {
      throw new BadRequestException('Бойову задачу можна дати тільки бойовому розрахунку');
    }

    if (asset.readinessStatus !== 'ready') {
      throw new BadRequestException('Розрахунок не готовий до задачі');
    }

    return asset;
  }

  private async normalizeBody(data: UpsertAirAssetTaskDto, asset: AirAssetPosition) {
    const points = data.points ?? [];

if (data.taskType === 'recon' && points.length < 3) {
  throw new BadRequestException('Район задачі має містити мінімум 3 точки');
}

if (data.taskType === 'combat' && points.length < 1) {
  throw new BadRequestException('Бойова задача має містити цільову точку');
}

    const plannedStartAt = data.plannedStartAt ? new Date(data.plannedStartAt) : null;
    const plannedEndAt = data.plannedEndAt ? new Date(data.plannedEndAt) : null;

    if (plannedStartAt && Number.isNaN(plannedStartAt.getTime())) {
      throw new BadRequestException('Некоректний плановий початок');
    }
    if (plannedEndAt && Number.isNaN(plannedEndAt.getTime())) {
      throw new BadRequestException('Некоректне планове завершення');
    }
    if (plannedStartAt && plannedEndAt && plannedEndAt.getTime() <= plannedStartAt.getTime()) {
      throw new BadRequestException('Завершення має бути пізніше початку');
    }

    const droneModelId = await this.resolveDroneModel(asset, data.droneModelId);
    const warheadTypeId = await this.resolveWarheadType(asset, data.taskType, data.warheadTypeId);

    return {
      taskType: data.taskType,
      name: data.name.trim(),
      droneModelId,
      warheadTypeId,
      areaName: data.areaName.trim(),
      plannedStartAt,
      plannedEndAt,
      status: data.status ?? 'planned',
      note: data.note?.trim() || null,
      points: points.map((point) => {
        const lat = Number(point.lat);
        const lng = Number(point.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new BadRequestException('Координати району задачі некоректні');
        }
        return { lat, lng };
      }),
    };
  }

  private async resolveDroneModel(asset: AirAssetPosition, requestedId?: string): Promise<string | null> {
    const stock = await this.droneStock.find({
      where: { airAssetPositionId: asset.id },
      relations: { droneModel: true },
      order: { updatedAt: 'DESC' },
    });
    const available = stock.filter((row) => row.quantity > 0);

    if (!available.length) {
      if (asset.assetGroup === 'combat') throw new BadRequestException('У бойового розрахунку немає доступних бортів');
      return null;
    }

    if (requestedId) {
      const selected = available.find((row) => row.droneModelId === requestedId);
      if (!selected) throw new BadRequestException('Обраного борта немає в наявності у цього розрахунку');
      return selected.droneModelId;
    }

    if (available.length === 1) return available[0].droneModelId;
    throw new BadRequestException('Оберіть борт із наявних у розрахунку');
  }

  private async resolveWarheadType(
    asset: AirAssetPosition,
    taskType: 'recon' | 'combat',
    requestedId?: string,
  ): Promise<string | null> {
    if (taskType === 'recon') return null;

    const stock = await this.warheadStock.find({ where: { airAssetPositionId: asset.id } });
    const available = stock.filter((row) => row.quantity > 0);

    if (!available.length) return null;
    if (!requestedId && available.length === 1) return available[0].warheadTypeId;
    if (!requestedId) throw new BadRequestException('Оберіть БЧ із наявних у розрахунку');

    const selected = available.find((row) => row.warheadTypeId === requestedId);
    if (!selected) throw new BadRequestException('Обраної БЧ немає в наявності у цього розрахунку');
    return selected.warheadTypeId;
  }

  private ensureUserCanManageAirAssets(user: AuthUser): void {
    if (user.role === 'observer') throw new ForbiddenException('Спостерігач не може створювати задачі');
    if (user.scope === 'ew') {
      throw new ForbiddenException('Оператор РЕБ не може створювати задачі повітряним розрахункам');
    }
  }

  private async ensureCanUseUnit(user: AuthUser, unitId: string): Promise<void> {
    const canAccess = await this.accessScope.canAccessUnit(user, unitId);
    if (!canAccess) throw new ForbiddenException('Немає доступу до цього підрозділу');
  }

  private async writeTaskEvent(
    task: AirAssetTask,
    user: AuthUser,
    action: 'created' | 'updated' | 'deleted',
  ): Promise<void> {
    const typeLabel = task.taskType === 'combat' ? 'бойова задача БпЛА' : 'задача на розвідку';
    const actionLabel = action === 'created' ? 'Створено' : action === 'updated' ? 'Оновлено' : 'Видалено';

    await this.eventLogs.create({
      eventType: 'air_asset_task',
      action,
      actor: user,
      unitId: task.unitId,
      unitName: task.unit?.name ?? task.airAssetPosition?.unit?.name ?? null,
      entityType: 'air_asset_task',
      entityId: task.id,
      entityName: task.name,
      title: `${actionLabel} ${typeLabel}`,
      details: `${task.airAssetPosition?.callsign || task.airAssetPosition?.name || 'Розрахунок'} · ${task.areaName} · ${task.status}`,
      metadata: {
        taskType: task.taskType,
        airAssetPositionId: task.airAssetPositionId,
        droneModelId: task.droneModelId,
        warheadTypeId: task.warheadTypeId,
      },
    });
  }

  private emitChanged(action: 'created' | 'updated' | 'deleted', id: string, unitId?: string): void {
    this.realtimeEvents.emitMany(['map', 'events', 'missions'], action, {
      entity: 'air_asset_task',
      id,
      unitId,
    });
  }

  private async ensureSchema(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE drone_models
      ADD COLUMN IF NOT EXISTS drone_group VARCHAR(50) NOT NULL DEFAULT 'recon',
      ADD COLUMN IF NOT EXISTS drone_type VARCHAR(50) NOT NULL DEFAULT 'copter',
      ADD COLUMN IF NOT EXISTS camera_type VARCHAR(50) NOT NULL DEFAULT 'none'
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS air_asset_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_type VARCHAR(30) NOT NULL,
        name VARCHAR(255) NOT NULL,
        unit_id UUID NOT NULL REFERENCES units(id),
        air_asset_position_id UUID NOT NULL REFERENCES air_asset_positions(id) ON DELETE CASCADE,
        drone_model_id UUID NULL REFERENCES drone_models(id),
        warhead_type_id UUID NULL REFERENCES drone_warhead_types(id),
        area_name VARCHAR(255) NOT NULL,
        planned_start_at TIMESTAMP NULL,
        planned_end_at TIMESTAMP NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'planned',
        note TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS air_asset_task_points (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES air_asset_tasks(id) ON DELETE CASCADE,
        point_order INT NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL
      )
    `);
    await this.dataSource.query('CREATE INDEX IF NOT EXISTS idx_air_asset_tasks_unit ON air_asset_tasks(unit_id)');
    await this.dataSource.query('CREATE INDEX IF NOT EXISTS idx_air_asset_tasks_asset ON air_asset_tasks(air_asset_position_id)');
    await this.dataSource.query('CREATE INDEX IF NOT EXISTS idx_air_asset_task_points_task ON air_asset_task_points(task_id)');
  }
}
