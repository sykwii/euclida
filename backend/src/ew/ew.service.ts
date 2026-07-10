import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.types';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { latLngToMgrs, mgrsToLatLng } from '../common/geo/mgrs.util';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateEwPositionDto } from './dto/create-ew-position.dto';
import { UpdateEwPositionDto } from './dto/update-ew-position.dto';
import { EwFrequencyRange } from './ew-frequency-range.entity';
import { EwPosition } from './ew-position.entity';

@Injectable()
export class EwService {
  constructor(
    @InjectRepository(EwPosition)
    private readonly repository: Repository<EwPosition>,
    private readonly accessScope: AccessScopeService,
    private readonly realtimeEvents: RealtimeEventsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(user: AuthUser) {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) return [];

    return this.repository.find({
      where: allowedUnitIds === null ? {} : { unitId: In(allowedUnitIds) },
      relations: { unit: true, frequencyRanges: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<EwPosition> {
    const item = await this.repository.findOne({
      where: { id },
      relations: { unit: true, frequencyRanges: true },
    });

    if (!item) throw new NotFoundException('Позицію РЕБ не знайдено');
    return item;
  }

  async create(data: CreateEwPositionDto, user: AuthUser): Promise<EwPosition> {
    await this.ensureCanUseUnit(user, data.unitId);
    const coordinates = this.resolveCoordinates(data.lat, data.lng, data.mgrs);
    const sector = this.resolveSector(data);

    const item = this.repository.create({
      name: data.name.trim(),
      unitId: data.unitId,
      callsign: data.callsign.trim(),
      stationName: data.stationName.trim(),
      lat: coordinates.lat,
      lng: coordinates.lng,
      mgrs: coordinates.mgrs,
      effectMode: data.effectMode,
      radiusM: data.effectMode === 'radius' ? data.radiusM ?? null : null,
      readinessStatus: data.readinessStatus ?? 'ready',
      notReadyReason: data.readinessStatus === 'not_ready' ? data.notReadyReason ?? null : null,
      personnelRotationDate: data.personnelRotationDate ?? null,
      note: data.note ?? null,
      ...sector,
      frequencyRanges: this.normalizeFrequencyRanges(data.frequencyRanges),
    });

    const saved = await this.repository.save(item);
    this.emitChanged('created', saved.id);
    return this.findOne(saved.id);
  }

  async update(id: string, data: UpdateEwPositionDto, user: AuthUser): Promise<EwPosition> {
    const item = await this.findOne(id);
    await this.ensureCanUseUnit(user, item.unitId);

    if (data.unitId !== undefined) await this.ensureCanUseUnit(user, data.unitId);

    const coordinates = this.resolveCoordinates(
      data.lat !== undefined ? data.lat : item.lat,
      data.lng !== undefined ? data.lng : item.lng,
      data.mgrs !== undefined ? data.mgrs : item.mgrs ?? undefined,
    );
    const merged = { ...item, ...data } as CreateEwPositionDto;
    const sector = this.resolveSector(merged);

    Object.assign(item, {
      ...data,
      name: data.name !== undefined ? data.name.trim() : item.name,
      callsign: data.callsign !== undefined ? data.callsign.trim() : item.callsign,
      stationName: data.stationName !== undefined ? data.stationName.trim() : item.stationName,
      lat: coordinates.lat,
      lng: coordinates.lng,
      mgrs: coordinates.mgrs,
      radiusM: (data.effectMode ?? item.effectMode) === 'radius' ? data.radiusM ?? item.radiusM : null,
      notReadyReason: (data.readinessStatus ?? item.readinessStatus) === 'not_ready' ? data.notReadyReason ?? item.notReadyReason : null,
      ...sector,
    });

    const saved = await this.repository.save(item);

    if (data.frequencyRanges !== undefined) {
      await this.dataSource.getRepository(EwFrequencyRange).delete({ ewPositionId: saved.id });
      const ranges = this.normalizeFrequencyRanges(data.frequencyRanges).map((range) => ({ ...range, ewPositionId: saved.id }));
      await this.dataSource.getRepository(EwFrequencyRange).save(ranges);
    }

    this.emitChanged('updated', saved.id);
    return this.findOne(saved.id);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const item = await this.findOne(id);
    await this.ensureCanUseUnit(user, item.unitId);
    await this.repository.remove(item);
    this.emitChanged('deleted', id);
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

  private resolveSector(data: Partial<CreateEwPositionDto>) {
    if (data.effectMode !== 'sector') {
      return {
        mainDirectionUnits: null,
        mainDirectionDegrees: null,
        traverseLeftUnits: null,
        traverseLeftDegrees: null,
        traverseRightUnits: null,
        traverseRightDegrees: null,
        sectorLeftDegrees: null,
        sectorRightDegrees: null,
      };
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

  private normalizeFrequencyRanges(ranges: CreateEwPositionDto['frequencyRanges']): Partial<EwFrequencyRange>[] {
    if (!ranges || ranges.length === 0) throw new BadRequestException('Додайте хоча б один діапазон частот');

    return ranges.map((range) => {
      if (Number(range.frequencyToMhz) < Number(range.frequencyFromMhz)) {
        throw new BadRequestException('Кінцева частота не може бути меншою за початкову');
      }

      return {
        label: range.label?.trim() || null,
        frequencyFromMhz: Number(range.frequencyFromMhz),
        frequencyToMhz: Number(range.frequencyToMhz),
      };
    });
  }

  private normalizeDegrees(value: number): number {
    return ((value % 360) + 360) % 360;
  }

  private async ensureCanUseUnit(user: AuthUser, unitId: string): Promise<void> {
    const canAccess = await this.accessScope.canAccessUnit(user, unitId);
    if (!canAccess) throw new ForbiddenException('Немає доступу до цього підрозділу');
  }

  private emitChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['map', 'events'], action, { entity: 'ew_position', id });
  }
}
