import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { EventLogsService } from '../event-logs/event-logs.service';
import { AirAssetPosition } from './air-asset-position.entity';
import { AirReconAreaPoint } from './air-recon-area-point.entity';
import { AirReconArea } from './air-recon-area.entity';
import { UpsertAirReconAreaDto, AirReconAreaStatus } from './dto/upsert-air-recon-area.dto';

@Injectable()
export class AirReconAreasService {
  constructor(
    @InjectRepository(AirReconArea)
    private readonly areas: Repository<AirReconArea>,
    @InjectRepository(AirAssetPosition)
    private readonly assets: Repository<AirAssetPosition>,
    private readonly accessScope: AccessScopeService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly eventLogs: EventLogsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  findAll(user: AuthUser): Promise<AirReconArea[]> {
    return this.findScoped(user);
  }

  async findByAsset(airAssetId: string, user: AuthUser): Promise<AirReconArea[]> {
    await this.ensureSchema();
    const asset = await this.findReconAssetOrFail(airAssetId, user);

    return this.areas.find({
      where: { airAssetPositionId: asset.id },
      relations: { airAssetPosition: { unit: true }, points: true },
      order: { plannedStartAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: AuthUser): Promise<AirReconArea> {
    await this.ensureSchema();
    const area = await this.areas.findOne({
      where: { id },
      relations: { airAssetPosition: { unit: true }, points: true },
    });

    if (!area) {
      throw new NotFoundException('Район розвідки не знайдено');
    }

    await this.ensureCanUseUnit(user, area.airAssetPosition.unitId);
    return area;
  }

  async create(airAssetId: string, data: UpsertAirReconAreaDto, user: AuthUser): Promise<AirReconArea> {
    await this.ensureSchema();
    const asset = await this.findReconAssetOrFail(airAssetId, user);
    const normalized = this.normalizeBody(data);

    const saved = await this.dataSource.transaction(async (manager) => {
      const area = manager.create(AirReconArea, {
        airAssetPositionId: asset.id,
        name: normalized.name,
        activeDate: normalized.activeDate,
        plannedStartAt: normalized.plannedStartAt,
        plannedEndAt: normalized.plannedEndAt,
        status: normalized.status,
        note: normalized.note,
        points: normalized.points.map((point, index) =>
          manager.create(AirReconAreaPoint, {
            pointOrder: point.pointOrder ?? index + 1,
            lat: point.lat,
            lng: point.lng,
          }),
        ),
      });

      return manager.save(AirReconArea, area);
    });

    await this.writeAreaEvent(saved, asset, user, 'created');
    this.emitChanged('created', saved.id, asset.unitId);
    return this.findOne(saved.id, user);
  }

  async update(id: string, data: UpsertAirReconAreaDto, user: AuthUser): Promise<AirReconArea> {
    await this.ensureSchema();
    const area = await this.findOne(id, user);
    const normalized = this.normalizeBody(data);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(AirReconAreaPoint, { areaId: area.id });

      await manager.update(AirReconArea, area.id, {
        name: normalized.name,
        activeDate: normalized.activeDate,
        plannedStartAt: normalized.plannedStartAt,
        plannedEndAt: normalized.plannedEndAt,
        status: normalized.status,
        note: normalized.note,
      });

      await manager.save(
        AirReconAreaPoint,
        normalized.points.map((point, index) =>
          manager.create(AirReconAreaPoint, {
            areaId: area.id,
            pointOrder: point.pointOrder ?? index + 1,
            lat: point.lat,
            lng: point.lng,
          }),
        ),
      );
    });

    await this.writeAreaEvent(area, area.airAssetPosition, user, 'updated');
    this.emitChanged('updated', area.id, area.airAssetPosition.unitId);
    return this.findOne(area.id, user);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const area = await this.findOne(id, user);
    await this.areas.remove(area);
    await this.writeAreaEvent(area, area.airAssetPosition, user, 'deleted');
    this.emitChanged('deleted', area.id, area.airAssetPosition.unitId);
  }

  private async findScoped(user: AuthUser): Promise<AirReconArea[]> {
    await this.ensureSchema();
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return [];
    }

    return this.areas.find({
      where:
        allowedUnitIds === null
          ? {}
          : {
              airAssetPosition: {
                unitId: In(allowedUnitIds),
              },
            },
      relations: { airAssetPosition: { unit: true }, points: true },
      order: { plannedStartAt: 'DESC', createdAt: 'DESC' },
    });
  }

  private normalizeBody(data: UpsertAirReconAreaDto) {
    const points = data.points ?? [];

    if (points.length < 3) {
      throw new BadRequestException('Район розвідки має містити мінімум 3 точки');
    }

    const plannedStartAt = data.plannedStartAt ? new Date(data.plannedStartAt) : null;
    const plannedEndAt = data.plannedEndAt ? new Date(data.plannedEndAt) : null;

    if (plannedStartAt && Number.isNaN(plannedStartAt.getTime())) {
      throw new BadRequestException('Некоректний плановий початок району');
    }

    if (plannedEndAt && Number.isNaN(plannedEndAt.getTime())) {
      throw new BadRequestException('Некоректне планове завершення району');
    }

    if (plannedStartAt && plannedEndAt && plannedEndAt.getTime() <= plannedStartAt.getTime()) {
      throw new BadRequestException('Планове завершення має бути пізніше початку');
    }

    return {
      name: data.name?.trim() || 'Район розвідки',
      activeDate: data.activeDate || this.toDateOnly(plannedStartAt ?? new Date()),
      plannedStartAt,
      plannedEndAt,
      status: this.normalizeStatus(data.status),
      note: data.note?.trim() || null,
      points: points.map((point) => {
        const lat = Number(point.lat);
        const lng = Number(point.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new BadRequestException('Координати району мають бути коректними числами');
        }

        return {
          lat,
          lng,
          pointOrder: point.pointOrder,
        };
      }),
    };
  }

  private normalizeStatus(status?: AirReconAreaStatus): AirReconAreaStatus {
    if (status && ['planned', 'active', 'completed', 'cancelled'].includes(status)) {
      return status;
    }

    return 'planned';
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private async findReconAssetOrFail(id: string, user: AuthUser): Promise<AirAssetPosition> {
    const asset = await this.assets.findOne({ where: { id }, relations: { unit: true } });

    if (!asset) {
      throw new NotFoundException('Повітряний розрахунок не знайдено');
    }

    if (asset.assetGroup !== 'recon') {
      throw new BadRequestException('Райони розвідки доступні тільки для розвідувальних розрахунків');
    }

    await this.ensureCanUseUnit(user, asset.unitId);
    return asset;
  }

  private async ensureCanUseUnit(user: AuthUser, unitId: string): Promise<void> {
    const canAccess = await this.accessScope.canAccessUnit(user, unitId);

    if (!canAccess) {
      throw new ForbiddenException('Немає доступу до цього підрозділу');
    }
  }

  private async ensureSchema(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE air_recon_areas
      ADD COLUMN IF NOT EXISTS planned_start_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS planned_end_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'planned'
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_air_recon_areas_asset_position
      ON air_recon_areas(air_asset_position_id)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_air_recon_areas_status
      ON air_recon_areas(status)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_air_recon_areas_planned_window
      ON air_recon_areas(planned_start_at, planned_end_at)
    `);
  }

  private emitChanged(action: 'created' | 'updated' | 'deleted', id: string, unitId?: string): void {
    this.realtimeEvents.emitMany(['map', 'events'], action, {
      entity: 'air_recon_area',
      id,
      unitId,
    });
  }

  private async writeAreaEvent(
    area: AirReconArea,
    asset: AirAssetPosition,
    user: AuthUser,
    action: 'created' | 'updated' | 'deleted',
  ): Promise<void> {
    const titles: Record<typeof action, string> = {
      created: 'Створено район розвідки',
      updated: 'Оновлено район розвідки',
      deleted: 'Видалено район розвідки',
    };

    await this.eventLogs.create({
      eventType: 'air_recon_area',
      action,
      actor: user,
      unitId: asset.unitId,
      unitName: asset.unit?.name ?? area.airAssetPosition?.unit?.name ?? null,
      entityType: 'air_recon_area',
      entityId: area.id,
      entityName: area.name || asset.callsign || asset.name,
      title: titles[action],
      details: `${asset.callsign || asset.name} · ${area.name || 'Район'} · ${area.status || 'planned'}`,
    });
  }
}
