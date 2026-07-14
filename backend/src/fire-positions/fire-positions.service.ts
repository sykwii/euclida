import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
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
import { WeaponDeployment } from '../weapon-systems/weapon-deployment.entity';
import { ForbiddenException } from '@nestjs/common';
import { In } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.types';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { EventLogsService } from '../event-logs/event-logs.service';
import { ConfirmFirePositionReadinessDto } from './dto/confirm-fire-position-readiness.dto';
import { OperationalNotificationsService } from '../operational-notifications/operational-notifications.service';

type FireReadinessReason =
  | 'fp_not_prepared'
  | 'fp_threat'
  | 'weapon_missing'
  | 'weapon_moving'
  | 'weapon_not_ready'
  | 'weapon_active_maintenance';

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
    private readonly eventLogs: EventLogsService,
    private readonly operationalNotifications?: OperationalNotificationsService,
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
        incomingWeapon: WeaponSystem | null;
        incomingDeployment: WeaponDeployment | null;
        aggregateReady: boolean;
        aggregateReadinessReasons: FireReadinessReason[];
        canEdit: boolean;
        isOwnScope: boolean;
        publicViewOnly: boolean;
      }
    > = [];

    for (const position of positions) {
      const assignedWeapon = await this.findAssignedWeaponForPosition(position.id);
      const incomingDeployment = await this.findIncomingDeployment(position.id);
      const incomingWeapon = incomingDeployment?.weaponSystem ?? null;
      const effectiveUnitId = this.resolveEffectiveUnitId(
        position,
        assignedWeapon,
        incomingWeapon,
      );
      const isOwnScope =
        allowedUnitIds === null ||
        (!!effectiveUnitId && allowedUnitIds.includes(effectiveUnitId));

      const syncedPosition = this.applyWeaponStateToFirePosition(
        position,
        assignedWeapon,
      );

      result.push({
        ...syncedPosition,
        assignedWeapon: isOwnScope ? assignedWeapon : null,
        incomingWeapon: isOwnScope ? incomingWeapon : null,
        incomingDeployment: isOwnScope ? incomingDeployment : null,
        aggregateReady: this.isFireReady(syncedPosition, assignedWeapon),
        aggregateReadinessReasons: this.getFireReadinessReasons(
          syncedPosition,
          assignedWeapon,
        ),
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

  async confirmReadiness(
    id: string,
    body: ConfirmFirePositionReadinessDto,
    user: AuthUser,
  ): Promise<FirePosition> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const firePositionRepository = manager.getRepository(FirePosition);
      const item = await firePositionRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) {
        throw new NotFoundException('ВП не знайдено');
      }

      const previousReadinessStatus = item.readinessStatus;
      const assignedWeapon = await this.findCanonicalAssignedWeapon(
        manager.getRepository(WeaponSystem),
        item.id,
      );
      const effectiveUnitId = item.unitId ?? assignedWeapon?.unitId ?? null;

      if (!effectiveUnitId) {
        throw new BadRequestException('Не визначено підрозділ ВП');
      }

      if (!item.unitId && assignedWeapon?.unitId) {
        item.unitId = assignedWeapon.unitId;
      }

      await this.ensureCanUseUnit(user, effectiveUnitId);

      if (body.readinessStatus === 'combat_ready') {
        item.readinessStatus = 'combat_ready';
        item.notReadyReason = null;
      } else {
        item.readinessStatus = 'not_combat_ready';
        item.notReadyReason = this.normalizeNotReadyReason(body.notReadyReason);
      }

      const savedItem = await manager.save(FirePosition, item);
      return { savedItem, previousReadinessStatus };
    });

    await this.writeReadinessEvent(saved.savedItem, user);
    this.emitFirePositionChanged('updated', saved.savedItem.id);
    await this.operationalNotifications?.notifyFirePositionReadinessTransition(
      saved.previousReadinessStatus,
      saved.savedItem.id,
      user.sub,
    );
    return saved.savedItem;
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
    const assignedWeapon = await this.findAssignedWeaponForPosition(id);
    const incomingDeployment = await this.findIncomingDeployment(id);
    const incomingWeapon = incomingDeployment?.weaponSystem ?? null;

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
        incomingWeapon,
        incomingDeployment,
        aggregateReady: this.isFireReady(syncedFirePosition, assignedWeapon),
        aggregateReadinessReasons: this.getFireReadinessReasons(
          syncedFirePosition,
          assignedWeapon,
        ),
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
        ...syncedFirePosition,
        unit: assignedWeapon?.unit ?? syncedFirePosition.unit,
      },
      assignedWeapon,
      incomingWeapon,
      incomingDeployment,
      aggregateReady: this.isFireReady(syncedFirePosition, assignedWeapon),
      aggregateReadinessReasons: this.getFireReadinessReasons(
        syncedFirePosition,
        assignedWeapon,
      ),
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
      completedRequestsCount: syncedFirePosition.completedVgzCount ?? 0,
    };
  }

  async findAllForMap(user: AuthUser) {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return [];
    }

    const scopedPositionIds =
      allowedUnitIds === null
        ? []
        : await this.findScopedPositionIdsFromWeapons(allowedUnitIds);
    const where: FindOptionsWhere<FirePosition> | FindOptionsWhere<FirePosition>[] =
      allowedUnitIds === null
        ? {}
        : [
            { unitId: In(allowedUnitIds) },
            ...(scopedPositionIds.length > 0
              ? [{ id: In(scopedPositionIds) }]
              : []),
          ];

    const positions = await this.repository.find({
      where,
      relations: {
        unit: true,
        ammoDepot: true,
      },
      order: {
        name: 'ASC',
      },
    });

    const result: Array<
      FirePosition & {
        maxSectorDistanceM: number;
        assignedWeapon: WeaponSystem | null;
        incomingWeapon: WeaponSystem | null;
        incomingDeployment: WeaponDeployment | null;
        aggregateReady: boolean;
        aggregateReadinessReasons: FireReadinessReason[];
      }
    > = [];

    for (const position of positions) {
      const assignedWeapon = await this.findAssignedWeaponForPosition(position.id);
      const syncedPosition = this.applyWeaponStateToFirePosition(
        position,
        assignedWeapon,
      );
      const incomingDeployment = await this.findIncomingDeployment(position.id);
      const incomingWeapon = incomingDeployment?.weaponSystem ?? null;
      const effectiveUnitId = this.resolveEffectiveUnitId(
        position,
        assignedWeapon,
        incomingWeapon,
      );

      if (
        allowedUnitIds !== null &&
        (!effectiveUnitId || !allowedUnitIds.includes(effectiveUnitId))
      ) {
        continue;
      }

      const maxSectorDistanceM =
        await this.getMaxSectorDistanceForPosition(syncedPosition);

      result.push({
        ...syncedPosition,
        maxSectorDistanceM,
        assignedWeapon,
        incomingWeapon,
        incomingDeployment,
        aggregateReady: this.isFireReady(syncedPosition, assignedWeapon),
        aggregateReadinessReasons: this.getFireReadinessReasons(
          syncedPosition,
          assignedWeapon,
        ),
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

  private async findIncomingDeployment(
    firePositionId: string,
  ): Promise<WeaponDeployment | null> {
    return this.dataSource.getRepository(WeaponDeployment).findOne({
      where: {
        toLocationType: 'fire_position',
        toLocationId: firePositionId,
        status: In(['planned', 'moving']),
      },
      relations: {
        weaponSystem: {
          weaponModel: true,
          unit: true,
          maintenances: true,
        },
      },
      order: { updatedAt: 'DESC' },
    });
  }

  private resolveEffectiveUnitId(
    position: FirePosition,
    assignedWeapon?: WeaponSystem | null,
    incomingWeapon?: WeaponSystem | null,
  ): string | null {
    if (position.unitId) {
      return position.unitId;
    }

    if (
      assignedWeapon?.unitId &&
      assignedWeapon.deploymentStatus === 'at_fire_position' &&
      assignedWeapon.currentFirePositionId === position.id
    ) {
      return assignedWeapon.unitId;
    }

    return incomingWeapon?.unitId ?? null;
  }

  private async findAssignedWeaponForPosition(
    firePositionId: string,
  ): Promise<WeaponSystem | null> {
    const repository = this.dataSource.getRepository(WeaponSystem);
    const canonical = await this.findCanonicalAssignedWeapon(
      repository,
      firePositionId,
    );

    if (canonical) {
      return canonical;
    }

    return this.findLegacyAssignedWeapon(repository, firePositionId);
  }

  private async findCanonicalAssignedWeapon(
    repository: Repository<WeaponSystem>,
    firePositionId: string,
  ): Promise<WeaponSystem | null> {
    return repository.findOne({
      where: {
        currentFirePositionId: firePositionId,
        deploymentStatus: 'at_fire_position',
      },
      relations: {
        weaponModel: true,
        unit: true,
        maintenances: true,
      },
    });
  }

  private async findLegacyAssignedWeapon(
    repository: Repository<WeaponSystem>,
    firePositionId: string,
  ): Promise<WeaponSystem | null> {
    return repository.findOne({
      where: {
        firePositionId,
        locationType: 'fire_position',
      },
      relations: {
        weaponModel: true,
        unit: true,
        maintenances: true,
      },
    });
  }

  private async findScopedPositionIdsFromWeapons(
    allowedUnitIds: string[],
  ): Promise<string[]> {
    const canonicalWeapons = await this.dataSource.getRepository(WeaponSystem).find({
      where: {
        deploymentStatus: 'at_fire_position',
        unitId: In(allowedUnitIds),
      },
      select: { currentFirePositionId: true },
    });
    const incomingDeployments = await this.dataSource
      .getRepository(WeaponDeployment)
      .find({
        where: {
          toLocationType: 'fire_position',
          status: In(['planned', 'moving']),
          weaponSystem: {
            unitId: In(allowedUnitIds),
          },
        },
        relations: {
          weaponSystem: true,
        },
        select: {
          toLocationId: true,
          weaponSystem: {
            id: true,
            unitId: true,
          },
        },
      });

    return Array.from(
      new Set([
        ...canonicalWeapons
          .map((weapon) => weapon.currentFirePositionId)
          .filter((id): id is string => !!id),
        ...incomingDeployments
          .map((deployment) => deployment.toLocationId)
          .filter((id): id is string => !!id),
      ]),
    );
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

  private normalizeNotReadyReason(
    value: ConfirmFirePositionReadinessDto['notReadyReason'],
  ): 'threat' | 'damaged' | 'not_prepared' | 'occupied' | 'other' {
    if (
      value === 'threat' ||
      value === 'damaged' ||
      value === 'not_prepared' ||
      value === 'occupied' ||
      value === 'other'
    ) {
      return value;
    }

    throw new BadRequestException('Потрібно вказати причину НЕ БГ для ВП');
  }

  private isFireReady(
    firePosition: FirePosition,
    assignedWeapon: WeaponSystem | null,
  ): boolean {
    return this.getFireReadinessReasons(firePosition, assignedWeapon).length === 0;
  }

  private getFireReadinessReasons(
    firePosition: FirePosition,
    assignedWeapon: WeaponSystem | null,
  ): FireReadinessReason[] {
    const reasons: FireReadinessReason[] = [];

    if (firePosition.readinessStatus !== 'combat_ready') {
      reasons.push(
        firePosition.notReadyReason === 'threat' ? 'fp_threat' : 'fp_not_prepared',
      );
    }

    if (!assignedWeapon) {
      reasons.push('weapon_missing');
      return reasons;
    }

    if (
      assignedWeapon.deploymentStatus !== 'at_fire_position' ||
      assignedWeapon.currentFirePositionId !== firePosition.id
    ) {
      reasons.push('weapon_moving');
    }

    if (assignedWeapon.readinessStatus !== 'combat_ready') {
      reasons.push('weapon_not_ready');
    }

    if (this.hasActiveMaintenance(assignedWeapon)) {
      reasons.push('weapon_active_maintenance');
    }

    return reasons;
  }

  private hasActiveMaintenance(weapon: WeaponSystem): boolean {
    if (
      weapon.maintenanceStatus === 'opened' ||
      weapon.maintenanceStatus === 'in_progress' ||
      weapon.maintenanceStatus === 'pending' ||
      weapon.maintenanceStatus === 'approved'
    ) {
      return true;
    }

    return (
      weapon.maintenances?.some((item) =>
        item.status === 'opened' || item.status === 'in_progress',
      ) ?? false
    );
  }

  private async writeReadinessEvent(
    firePosition: FirePosition,
    user: AuthUser,
  ): Promise<void> {
    const ready = firePosition.readinessStatus === 'combat_ready';
    const title = ready ? 'ВП підтверджено БГ' : 'ВП позначено НЕ БГ';

    await this.eventLogs.create({
      eventType: 'fire_position_readiness',
      action: ready ? 'confirmed' : 'not_ready',
      actor: user,
      unitId: firePosition.unitId,
      unitName: firePosition.unit?.name ?? null,
      entityType: 'fire_position',
      entityId: firePosition.id,
      entityName: firePosition.name,
      title,
      details: `${user.fullName || user.login}: ${title}`,
      metadata: {
        readinessStatus: firePosition.readinessStatus,
        notReadyReason: firePosition.notReadyReason,
      },
    });
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

