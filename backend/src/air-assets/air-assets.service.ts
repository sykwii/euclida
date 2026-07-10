import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.types';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { latLngToMgrs, mgrsToLatLng } from '../common/geo/mgrs.util';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { EventLogsService } from '../event-logs/event-logs.service';
import { AirAssetPosition } from './air-asset-position.entity';
import { AirReconArea } from './air-recon-area.entity';
import { CreateAirAssetPositionDto } from './dto/create-air-asset-position.dto';
import { UpdateAirAssetPositionDto } from './dto/update-air-asset-position.dto';

@Injectable()
export class AirAssetsService {
  constructor(
    @InjectRepository(AirAssetPosition)
    private readonly repository: Repository<AirAssetPosition>,
    private readonly accessScope: AccessScopeService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly eventLogs: EventLogsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(user: AuthUser) {
    await this.ensureAirReconSchema();
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) return [];

    return this.repository.find({
      where: allowedUnitIds === null ? {} : { unitId: In(allowedUnitIds) },
      relations: { unit: true, reconAreas: { points: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user?: AuthUser): Promise<AirAssetPosition> {
    await this.ensureAirReconSchema();
    const item = await this.repository.findOne({
      where: { id },
      relations: { unit: true, reconAreas: { points: true } },
    });

    if (!item) throw new NotFoundException('Повітряний розрахунок не знайдено');
    if (user) await this.ensureCanUseUnit(user, item.unitId);
    return item;
  }

  async create(data: CreateAirAssetPositionDto, user: AuthUser): Promise<AirAssetPosition> {
    await this.ensureAirReconSchema();
    await this.ensureCanManageAirAssets(user);
    await this.ensureCanUseUnit(user, data.unitId);
    await this.ensureTargetUnitCompetence(data.unitId);
    this.validateAssetData(data);
    const coordinates = this.resolveCoordinates(data.lat, data.lng, data.mgrs);
    const sector = this.resolveSector(data);

    const item = this.repository.create({
      name: data.name.trim(),
      unitId: data.unitId,
      callsign: data.callsign.trim(),
      assetGroup: data.assetGroup,
      reconType: data.assetGroup === 'recon' ? data.reconType! : null,
      combatType: data.assetGroup === 'combat' ? data.combatType! : null,
      lat: coordinates.lat,
      lng: coordinates.lng,
      mgrs: coordinates.mgrs,
      readinessStatus: data.readinessStatus ?? 'ready',
      notReadyReason: data.readinessStatus === 'not_ready' ? data.notReadyReason ?? null : null,
      personnelRotationDate: data.personnelRotationDate ?? null,
      assetName: data.assetGroup === 'recon' ? data.assetName?.trim() ?? null : null,
      droneModel: data.assetGroup === 'combat' ? data.droneModel?.trim() ?? null : null,
      assetQuantity: 0,
      maxSectorDistanceM: data.assetGroup === 'combat' ? data.maxSectorDistanceM ?? null : null,
      note: data.note ?? null,
      ...sector,
      reconAreas: data.assetGroup === 'recon' ? this.normalizeReconAreas(data.reconAreas ?? []) : [],
    });

    const saved = await this.repository.save(item);
    const full = await this.findOne(saved.id, user);
    await this.writeAssetEvent(full, user, 'created');
    this.emitChanged('created', saved.id, full.unitId);
    return full;
  }

  async update(id: string, data: UpdateAirAssetPositionDto, user: AuthUser): Promise<AirAssetPosition> {
    await this.ensureAirReconSchema();
    await this.ensureCanManageAirAssets(user);
    const item = await this.findOne(id, user);
    await this.ensureCanUseUnit(user, item.unitId);
    if (data.unitId !== undefined) {
      await this.ensureCanUseUnit(user, data.unitId);
      await this.ensureTargetUnitCompetence(data.unitId);
    }

    const merged = { ...item, ...data } as CreateAirAssetPositionDto;
    this.validateAssetData(merged);
    const coordinates = this.resolveCoordinates(data.lat ?? item.lat, data.lng ?? item.lng, data.mgrs ?? item.mgrs ?? undefined);
    const sector = this.resolveSector(merged);

    Object.assign(item, {
      ...data,
      name: data.name !== undefined ? data.name.trim() : item.name,
      callsign: data.callsign !== undefined ? data.callsign.trim() : item.callsign,
      lat: coordinates.lat,
      lng: coordinates.lng,
      mgrs: coordinates.mgrs,
      reconType: merged.assetGroup === 'recon' ? merged.reconType! : null,
      combatType: merged.assetGroup === 'combat' ? merged.combatType! : null,
      assetName: merged.assetGroup === 'recon' ? merged.assetName ?? null : null,
      droneModel: merged.assetGroup === 'combat' ? merged.droneModel ?? null : null,
      maxSectorDistanceM: merged.assetGroup === 'combat' ? merged.maxSectorDistanceM ?? null : null,
      notReadyReason: (merged.readinessStatus ?? 'ready') === 'not_ready' ? merged.notReadyReason ?? null : null,
      ...sector,
    });

    const saved = await this.repository.save(item);

    if (data.reconAreas !== undefined) {
      await this.dataSource.getRepository(AirReconArea).delete({ airAssetPositionId: saved.id });
      const areas = this.normalizeReconAreas(data.reconAreas).map((area) => ({ ...area, airAssetPositionId: saved.id }));
      await this.dataSource.getRepository(AirReconArea).save(areas);
    }

    const full = await this.findOne(saved.id, user);
    await this.writeAssetEvent(full, user, 'updated');
    this.emitChanged('updated', saved.id, full.unitId);
    return full;
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.ensureCanManageAirAssets(user);
    const item = await this.findOne(id, user);
    await this.ensureCanUseUnit(user, item.unitId);
    await this.repository.remove(item);
    await this.writeAssetEvent(item, user, 'deleted');
    this.emitChanged('deleted', id, item.unitId);
  }

  private async ensureAirReconSchema(): Promise<void> {
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

  private validateAssetData(data: CreateAirAssetPositionDto): void {
    if (data.assetGroup === 'recon') {
      if (!data.reconType) throw new BadRequestException('Для розвідки потрібно обрати тип: коптер або крило');
      if (!data.assetName?.trim()) throw new BadRequestException('Для розвідки потрібно вказати найменування засобу');
      return;
    }

    if (!data.combatType) throw new BadRequestException('Для бойового розрахунку потрібно обрати тип дрона');
  }

  private normalizeReconAreas(areas: CreateAirAssetPositionDto['reconAreas']) {
    return (areas ?? []).map((area) => {
      if (!area.points || area.points.length < 3) {
        throw new BadRequestException('Район розвідки має містити мінімум 3 точки');
      }

      return {
        name: area.name?.trim() || null,
        activeDate: area.activeDate,
        plannedStartAt: area.plannedStartAt ? new Date(area.plannedStartAt) : null,
        plannedEndAt: area.plannedEndAt ? new Date(area.plannedEndAt) : null,
        status: area.status ?? 'planned',
        note: area.note ?? null,
        points: area.points.map((point, index) => ({ pointOrder: index + 1, lat: point.lat, lng: point.lng })),
      };
    });
  }

  private resolveCoordinates(lat?: number, lng?: number, mgrs?: string | null) {
    let resolvedLat = lat;
    let resolvedLng = lng;
    let resolvedMgrs = mgrs ?? null;

    if ((resolvedLat === undefined || resolvedLng === undefined) && resolvedMgrs) {
      const converted = mgrsToLatLng(resolvedMgrs);
      resolvedLat = converted.lat;
      resolvedLng = converted.lng;
    }

    if (resolvedLat === undefined || resolvedLng === undefined || resolvedLat === null || resolvedLng === null) {
      throw new BadRequestException('Потрібно вказати lat/lng або MGRS');
    }

    if (!resolvedMgrs) resolvedMgrs = latLngToMgrs(resolvedLat, resolvedLng);
    return { lat: resolvedLat, lng: resolvedLng, mgrs: resolvedMgrs };
  }

  private resolveSector(data: Partial<CreateAirAssetPositionDto>) {
    if (data.assetGroup !== 'combat') {
      return { mainDirectionUnits: null, mainDirectionDegrees: null, traverseLeftUnits: null, traverseLeftDegrees: null, traverseRightUnits: null, traverseRightDegrees: null, sectorLeftDegrees: null, sectorRightDegrees: null };
    }

    const mainDirectionDegrees = data.mainDirectionUnits !== undefined ? Math.ceil(Number(data.mainDirectionUnits) * 6) : null;
    const traverseLeftDegrees = data.traverseLeftUnits !== undefined ? Math.ceil(Number(data.traverseLeftUnits) * 6) : null;
    const traverseRightDegrees = data.traverseRightUnits !== undefined ? Math.ceil(Number(data.traverseRightUnits) * 6) : null;

    return {
      mainDirectionUnits: data.mainDirectionUnits ?? null,
      mainDirectionDegrees,
      traverseLeftUnits: data.traverseLeftUnits ?? null,
      traverseLeftDegrees,
      traverseRightUnits: data.traverseRightUnits ?? null,
      traverseRightDegrees,
      sectorLeftDegrees: mainDirectionDegrees !== null && traverseLeftDegrees !== null ? this.normalizeDegrees(mainDirectionDegrees - traverseLeftDegrees) : null,
      sectorRightDegrees: mainDirectionDegrees !== null && traverseRightDegrees !== null ? this.normalizeDegrees(mainDirectionDegrees + traverseRightDegrees) : null,
    };
  }

  private normalizeDegrees(value: number): number {
    return ((value % 360) + 360) % 360;
  }

  private async ensureCanUseUnit(user: AuthUser, unitId: string): Promise<void> {
    const canAccess = await this.accessScope.canAccessUnit(user, unitId);
    if (!canAccess) throw new ForbiddenException('Немає доступу до цього підрозділу');
  }

  private async ensureCanManageAirAssets(user: AuthUser): Promise<void> {
    if (user.role === 'observer') {
      throw new ForbiddenException('Спостерігач не може змінювати повітряні розрахунки');
    }

    if (user.scope === 'ew') {
      throw new ForbiddenException('Оператор РЕБ працює тільки в межах РЕБ-компетенції');
    }
  }

  private async ensureTargetUnitCompetence(unitId: string): Promise<void> {
    const rows = await this.dataSource.query<{ type: string }[]>(
      'SELECT type FROM units WHERE id = $1 LIMIT 1',
      [unitId],
    );

    if (rows[0]?.type === 'ew') {
      throw new ForbiddenException('Для підрозділу РЕБ створюються РЕБ-позиції, а не повітряні розрахунки');
    }
  }

  private async writeAssetEvent(
    item: AirAssetPosition,
    user: AuthUser,
    action: 'created' | 'updated' | 'deleted',
  ): Promise<void> {
    const titles: Record<typeof action, string> = {
      created: 'Створено повітряний розрахунок',
      updated: 'Оновлено повітряний розрахунок',
      deleted: 'Видалено повітряний розрахунок',
    };

    await this.eventLogs.create({
      eventType: 'air_asset',
      action,
      actor: user,
      unitId: item.unitId,
      unitName: item.unit?.name ?? null,
      entityType: 'air_asset_position',
      entityId: item.id,
      entityName: item.callsign || item.name,
      title: titles[action],
      details: `${item.unit?.name || 'Підрозділ'} · ${item.name} · ${item.callsign}`,
    });
  }

  private emitChanged(action: 'created' | 'updated' | 'deleted', id: string, unitId?: string): void {
    this.realtimeEvents.emitMany(['map', 'events'], action, { entity: 'air_asset_position', id, unitId });
  }
}

