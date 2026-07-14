import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFirePositionDto } from './dto/create-fire-position.dto';
import { FirePosition } from './fire-position.entity';
import { UpdateFirePositionDto } from './dto/update-fire-position.dto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Depot } from '../depots/depot.entity';
import { BadRequestException } from '@nestjs/common';
import { latLngToMgrs, mgrsToLatLng } from '../common/geo/mgrs.util';
import { StockMovement } from '../stock-movements/stock-movement.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { ShellCompatibleCharge } from '../shell-compatible-charges/shell-compatible-charge.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { ForbiddenException } from '@nestjs/common';
import { In } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.types';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

@Injectable()
export class FirePositionsService implements OnModuleInit {
  private readonly logger = new Logger(FirePositionsService.name);

  constructor(
    @InjectRepository(FirePosition)
    private readonly repository: Repository<FirePosition>,
    private readonly accessScope: AccessScopeService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query(
        "ALTER TABLE fire_positions ADD COLUMN IF NOT EXISTS position_type VARCHAR(60) NOT NULL DEFAULT 'fire_position'",
      );
      await this.dataSource.query(
        "UPDATE fire_positions SET position_type = 'fire_position' WHERE position_type IS NULL OR TRIM(position_type) = ''",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to ensure fire_positions.position_type column: ${message}`,
      );
    }
  }

  async findAll(user: AuthUser) {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    const positions = await this.repository.find({
      relations: {
        unit: true,
        ammoDepot: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const result: Array<
      FirePosition & {
        assignedWeapon: WeaponSystem | null;
        canEdit: boolean;
        isOwnScope: boolean;
        publicViewOnly: boolean;
      }
    > = [];

    for (const position of positions) {
      const assignedWeapon = await this.dataSource
        .getRepository(WeaponSystem)
        .findOne({
          where: [
            {
              currentFirePositionId: position.id,
              deploymentStatus: 'at_fire_position',
            },
            {
              firePositionId: position.id,
              locationType: 'fire_position',
            },
          ],
          relations: {
            weaponModel: true,
            unit: true,
          },
        });

      const isOwnScope =
        allowedUnitIds === null ||
        (!!position.unitId && allowedUnitIds.includes(position.unitId));

      const syncedPosition = this.applyWeaponStateToFirePosition(
        position,
        assignedWeapon,
      );

      result.push({
        ...syncedPosition,
        assignedWeapon: isOwnScope ? assignedWeapon : null,
        canEdit:
          isOwnScope && (user.role === 'admin' || user.role === 'operator'),
        isOwnScope,
        publicViewOnly: !isOwnScope,
      });
    }

    return result;
  }

  async findOne(id: string): Promise<FirePosition> {
    const item = await this.repository.findOne({
      where: { id },
      relations: {
        unit: true,
        ammoDepot: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Вогневу позицію не знайдено');
    }

    return item;
  }

  async create(
    data: CreateFirePositionDto,
    user: AuthUser,
  ): Promise<FirePosition> {
    await this.ensureCanUseUnit(user, data.unitId ?? null);

    let lat = data.lat;
    let lng = data.lng;
    let mgrs = data.mgrs;

    if ((lat === undefined || lng === undefined) && mgrs) {
      const converted = mgrsToLatLng(mgrs);
      lat = converted.lat;
      lng = converted.lng;
    }

    if (lat === undefined || lng === undefined) {
      throw new BadRequestException('Потрібно вказати lat/lng або MGRS');
    }

    if (!mgrs) {
      mgrs = latLngToMgrs(lat, lng);
    }

    const mainDirectionDegrees =
      data.mainDirectionUnits !== undefined
        ? Math.ceil(Number(data.mainDirectionUnits) * 6)
        : null;

    const traverseLeftDegrees =
      data.traverseLeftUnits !== undefined
        ? Math.ceil(Number(data.traverseLeftUnits) * 6)
        : null;

    const traverseRightDegrees =
      data.traverseRightUnits !== undefined
        ? Math.ceil(Number(data.traverseRightUnits) * 6)
        : null;

    const sectorLeftDegrees =
      mainDirectionDegrees !== null && traverseLeftDegrees !== null
        ? this.normalizeDegrees(mainDirectionDegrees - traverseLeftDegrees)
        : null;

    const sectorRightDegrees =
      mainDirectionDegrees !== null && traverseRightDegrees !== null
        ? this.normalizeDegrees(mainDirectionDegrees + traverseRightDegrees)
        : null;
    const positionType = this.normalizePositionType(data.positionType);
    const isFirePosition = positionType === 'fire_position';
    return this.dataSource.transaction(async (manager) => {
      const ammoDepot = manager.create(Depot, {
        name: `БК ${data.name}`,
        depotType: 'fire_position_ammo',
        unitId: data.unitId ?? null,
        parentId: null,
      });

      const savedDepot = await manager.save(Depot, ammoDepot);

      const firePosition = manager.create(FirePosition, {
        ...data,
        positionType,
        lat,
        lng,
        mgrs,
        ammoDepotId: savedDepot.id,
        hasSg: false,
        readinessStatus: isFirePosition
          ? 'not_combat_ready'
          : (data.readinessStatus ?? 'combat_ready'),
        notReadyReason: isFirePosition
          ? 'not_prepared'
          : (data.notReadyReason ?? null),
        mainDirectionDegrees,
        traverseLeftDegrees,
        traverseRightDegrees,
        sectorLeftDegrees,
        sectorRightDegrees,
      });

      const savedFirePosition = await manager.save(FirePosition, firePosition);

      this.emitFirePositionChanged('created', savedFirePosition.id);
      return savedFirePosition;
    });
  }
  async update(
    id: string,
    data: UpdateFirePositionDto,
    user: AuthUser,
  ): Promise<FirePosition> {
    const item = await this.findOne(id);
    await this.ensureCanUseUnit(user, item.unitId);

    if (data.unitId !== undefined) {
      await this.ensureCanUseUnit(user, data.unitId ?? null);
    }

    const mainDirectionUnits =
      data.mainDirectionUnits !== undefined
        ? data.mainDirectionUnits
        : item.mainDirectionUnits;

    const traverseLeftUnits =
      data.traverseLeftUnits !== undefined
        ? data.traverseLeftUnits
        : item.traverseLeftUnits;

    const traverseRightUnits =
      data.traverseRightUnits !== undefined
        ? data.traverseRightUnits
        : item.traverseRightUnits;

    const mainDirectionDegrees =
      mainDirectionUnits !== null && mainDirectionUnits !== undefined
        ? Math.ceil(Number(mainDirectionUnits) * 6)
        : null;

    const traverseLeftDegrees =
      traverseLeftUnits !== null && traverseLeftUnits !== undefined
        ? Math.ceil(Number(traverseLeftUnits) * 6)
        : null;

    const traverseRightDegrees =
      traverseRightUnits !== null && traverseRightUnits !== undefined
        ? Math.ceil(Number(traverseRightUnits) * 6)
        : null;

    const sectorLeftDegrees =
      mainDirectionDegrees !== null && traverseLeftDegrees !== null
        ? this.normalizeDegrees(mainDirectionDegrees - traverseLeftDegrees)
        : null;

    const sectorRightDegrees =
      mainDirectionDegrees !== null && traverseRightDegrees !== null
        ? this.normalizeDegrees(mainDirectionDegrees + traverseRightDegrees)
        : null;
    let lat = data.lat !== undefined ? data.lat : item.lat;
    let lng = data.lng !== undefined ? data.lng : item.lng;
    let mgrs = data.mgrs !== undefined ? data.mgrs : item.mgrs;

    if ((data.lat === undefined || data.lng === undefined) && data.mgrs) {
      const converted = mgrsToLatLng(data.mgrs);
      lat = converted.lat;
      lng = converted.lng;
    }

    if (
      lat === undefined ||
      lng === undefined ||
      lat === null ||
      lng === null
    ) {
      throw new BadRequestException('Потрібно вказати lat/lng або MGRS');
    }

    if (!mgrs) {
      mgrs = latLngToMgrs(lat, lng);
    }

const positionType =
  data.positionType !== undefined
    ? this.normalizePositionType(data.positionType)
    : item.positionType;

    Object.assign(item, {
      ...data,
      positionType,
      lat,
      lng,
      mgrs,
      mainDirectionDegrees,
      traverseLeftDegrees,
      traverseRightDegrees,
      sectorLeftDegrees,
      sectorRightDegrees,
    });
    const saved = await this.repository.save(item);
    this.emitFirePositionChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const item = await this.findOne(id);

    await this.ensureCanUseUnit(user, item.unitId);

    await this.repository.remove(item);
    this.emitFirePositionChanged('deleted', id);
  }

private normalizePositionType(value: string | null | undefined): string {
  const allowed = [
    'fire_position',
    'aerial_recon',
    'ew_post',
    'ew_station',
    'air_asset_crew',
  ];

  return value && allowed.includes(value) ? value : 'fire_position';
}

  private emitFirePositionChanged(
    action: 'created' | 'updated' | 'deleted' | 'changed',
    id: string,
  ): void {
    this.realtimeEvents.emitMany(['map', 'analytics', 'events'], action, {
      entity: 'fire_position',
      id,
    });
  }

  private normalizeDegrees(value: number): number {
    return ((value % 360) + 360) % 360;
  }
  getSectorInfo(id: string) {
    return this.findOne(id).then((item) => ({
      id: item.id,
      name: item.name,
      mainDirectionUnits: item.mainDirectionUnits,
      mainDirectionDegrees: item.mainDirectionDegrees,
      traverseLeftUnits: item.traverseLeftUnits,
      traverseLeftDegrees: item.traverseLeftDegrees,
      traverseRightUnits: item.traverseRightUnits,
      traverseRightDegrees: item.traverseRightDegrees,
      sectorLeftDegrees: item.sectorLeftDegrees,
      sectorRightDegrees: item.sectorRightDegrees,
    }));
  }

  async getCard(id: string) {
    const firePosition = await this.repository.findOne({
      where: { id },
      relations: {
        unit: true,
        ammoDepot: true,
      },
    });

    if (!firePosition) {
      throw new NotFoundException('ВП не знайдено');
    }
    const assignedWeapon = await this.dataSource
      .getRepository(WeaponSystem)
      .findOne({
        where: [
          {
            currentFirePositionId: id,
            deploymentStatus: 'at_fire_position',
          },
          {
            firePositionId: id,
            locationType: 'fire_position',
          },
        ],
        relations: {
          weaponModel: true,
          unit: true,
        },
      });

    const syncedFirePosition = this.applyWeaponStateToFirePosition(
      firePosition,
      assignedWeapon,
    );
    await this.applyActiveAirThreatToFirePosition(syncedFirePosition);

    await this.repository.save(syncedFirePosition);

    const ammoDepotId = firePosition.ammoDepotId;

    if (!ammoDepotId) {
      return {
        firePosition: {
          ...syncedFirePosition,
          unit: assignedWeapon?.unit ?? syncedFirePosition.unit,
        },
        assignedWeapon,
        localStock: {
          shells: [],
          charges: [],
          fuzes: [],
          primers: [],
        },
        lastSupplyAt: null,
        completedRequestsCount: syncedFirePosition.completedVgzCount ?? 0,
      };
    }

    const lastSupply = await this.dataSource
      .getRepository(StockMovement)
      .findOne({
        where: { toDepotId: ammoDepotId },
        order: { movementDatetime: 'DESC' },
      });
    const shellStock = await this.dataSource
      .getRepository(DepotShellStock)
      .find({
        where: { depotId: ammoDepotId },
        relations: { shell: true },
      });

    const chargeStock = await this.dataSource
      .getRepository(DepotChargeStock)
      .find({
        where: { depotId: ammoDepotId },
        relations: { charge: true },
      });

    const shellIds = shellStock.map((item) => item.shellId);
    const chargeIds = chargeStock.map((item) => item.chargeId);

    const compatibleRanges = await this.dataSource
      .getRepository(ShellCompatibleCharge)
      .createQueryBuilder('compatibility')
      .where('compatibility.shellId IN (:...shellIds)', {
        shellIds: shellIds.length
          ? shellIds
          : ['00000000-0000-4000-8000-000000000000'],
      })
      .andWhere('compatibility.chargeId IN (:...chargeIds)', {
        chargeIds: chargeIds.length
          ? chargeIds
          : ['00000000-0000-4000-8000-000000000000'],
      })
      .getMany();

    const maxSectorDistanceM =
      compatibleRanges.length > 0
        ? Math.max(...compatibleRanges.map((item) => Number(item.maxRangeM)))
        : 0;

    return {
      firePosition: {
        ...firePosition,
        unit: assignedWeapon?.unit ?? firePosition.unit,
      },
      assignedWeapon,
      localStock: {
        shells: await this.dataSource.getRepository(DepotShellStock).find({
          where: { depotId: ammoDepotId },
          relations: { shell: true },
        }),
        charges: await this.dataSource.getRepository(DepotChargeStock).find({
          where: { depotId: ammoDepotId },
          relations: { charge: true },
        }),
        fuzes: await this.dataSource.getRepository(DepotFuzeStock).find({
          where: { depotId: ammoDepotId },
          relations: { fuze: true },
        }),
        primers: await this.dataSource.getRepository(DepotPrimerStock).find({
          where: { depotId: ammoDepotId },
          relations: { primer: true },
        }),
      },
      maxSectorDistanceM,
      lastSupplyAt: lastSupply?.movementDatetime ?? null,
      completedRequestsCount: firePosition.completedVgzCount ?? 0,
    };
  }

  async findAllForMap(user: AuthUser) {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return [];
    }

    const positions = await this.repository.find({
      where:
        allowedUnitIds === null
          ? {}
          : {
              unitId: In(allowedUnitIds),
            },
      relations: {
        unit: true,
        ammoDepot: true,
      },
      order: {
        name: 'ASC',
      },
    });

    const result: Array<
      FirePosition & { maxSectorDistanceM: number; assignedWeapon: WeaponSystem | null }
    > = [];

    for (const position of positions) {
      const assignedWeapon = await this.dataSource
        .getRepository(WeaponSystem)
        .findOne({
          where: [
            {
              currentFirePositionId: position.id,
              deploymentStatus: 'at_fire_position',
            },
            {
              firePositionId: position.id,
              locationType: 'fire_position',
            },
          ],
          relations: {
            weaponModel: true,
            unit: true,
          },
        });
      const syncedPosition = this.applyWeaponStateToFirePosition(
        position,
        assignedWeapon,
      );
      const maxSectorDistanceM =
        await this.getMaxSectorDistanceForPosition(syncedPosition);

      result.push({
        ...syncedPosition,
        maxSectorDistanceM,
        assignedWeapon,
      });
    }

    return result;
  }

  private async getMaxSectorDistanceForPosition(
    position: FirePosition,
  ): Promise<number> {
    if (!position.ammoDepotId) {
      return 0;
    }

    const shellStock = await this.dataSource
      .getRepository(DepotShellStock)
      .find({
        where: {
          depotId: position.ammoDepotId,
        },
      });

    const chargeStock = await this.dataSource
      .getRepository(DepotChargeStock)
      .find({
        where: {
          depotId: position.ammoDepotId,
        },
      });

    const shellIds = shellStock.map((item) => item.shellId);
    const chargeIds = chargeStock.map((item) => item.chargeId);

    if (shellIds.length === 0 || chargeIds.length === 0) {
      return 0;
    }

    const compatibleRanges = await this.dataSource
      .getRepository(ShellCompatibleCharge)
      .createQueryBuilder('compatibility')
      .where('compatibility.shellId IN (:...shellIds)', { shellIds })
      .andWhere('compatibility.chargeId IN (:...chargeIds)', { chargeIds })
      .getMany();

    if (compatibleRanges.length === 0) {
      return 0;
    }

    return Math.max(...compatibleRanges.map((item) => Number(item.maxRangeM)));
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
      throw new ForbiddenException('Немає доступу до цього підрозділу');
    }
  }

  private applyWeaponStateToFirePosition(
  firePosition: FirePosition,
  assignedWeapon: WeaponSystem | null,
): FirePosition {
  const positionType = firePosition.positionType || 'fire_position';

  if (positionType !== 'fire_position') {
    firePosition.hasSg = false;

    if (!firePosition.readinessStatus || firePosition.readinessStatus === 'unknown') {
      firePosition.readinessStatus = 'combat_ready';
    }

    if (firePosition.notReadyReason === 'Відсутня СГ') {
      firePosition.notReadyReason = null;
    }

    return firePosition;
  }

  if (!assignedWeapon) {
    firePosition.hasSg = false;
    if (!firePosition.readinessStatus || firePosition.readinessStatus === 'unknown') {
      firePosition.readinessStatus = 'not_combat_ready';
    }
    if (!firePosition.notReadyReason || firePosition.notReadyReason === 'Відсутня СГ') {
      firePosition.notReadyReason = 'not_prepared';
    }

    return firePosition;
  }

  firePosition.hasSg = true;
  firePosition.unitId = assignedWeapon.unitId;
  firePosition.unit = assignedWeapon.unit ?? firePosition.unit;
  if (!firePosition.readinessStatus || firePosition.readinessStatus === 'unknown') {
    firePosition.readinessStatus = 'not_combat_ready';
    firePosition.notReadyReason = firePosition.notReadyReason ?? 'not_prepared';
  }

  return firePosition;
}

  private async applyActiveAirThreatToFirePosition(
    firePosition: FirePosition,
  ): Promise<void> {
    if (firePosition.lat === null || firePosition.lng === null) {
      return;
    }

    const setting = await this.dataSource.query(
      `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
      ['air_threat_radius_m'],
    );
    const radiusM = Number(setting?.[0]?.value ?? 0);

    if (!Number.isFinite(radiusM) || radiusM <= 0) {
      return;
    }

    const threats = await this.dataSource.query(
      `
        SELECT threat_type, lat, lng
        FROM air_threats
        WHERE is_active = true
      `,
    );

    const nearestThreat = threats.find((threat: { lat: number; lng: number }) => {
      const distanceM = this.calculateDistanceM(
        firePosition.lat,
        firePosition.lng,
        Number(threat.lat),
        Number(threat.lng),
      );

      return distanceM <= radiusM;
    }) as { threat_type: string } | undefined;

    if (!nearestThreat) {
      return;
    }

    firePosition.readinessStatus = 'not_combat_ready';
    firePosition.notReadyReason = 'threat';
  }

  private calculateDistanceM(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const earthRadiusM = 6371000;
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusM * c;
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }
}

