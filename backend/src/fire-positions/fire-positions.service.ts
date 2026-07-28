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
import { ShotConfiguration } from '../shot-configurations/shot-configuration.entity';
import { WeaponDeployment } from '../weapon-systems/weapon-deployment.entity';
import { ForbiddenException } from '@nestjs/common';
import { In } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.types';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { EventLogsService } from '../event-logs/event-logs.service';
import { ConfirmFirePositionReadinessDto } from './dto/confirm-fire-position-readiness.dto';
import { OperationalNotificationsService } from '../operational-notifications/operational-notifications.service';
import {
  deriveFirePositionOperationalState,
  FirePositionOperationalReasonCode,
  FirePositionOperationalState,
} from './fire-position-operational-state';
import { deriveFirePositionSector } from './fire-position-sector';

type FireReadinessReason = Exclude<FirePositionOperationalReasonCode, null>;

type OperationalFirePosition = FirePosition & {
  operationalState: FirePositionOperationalState;
  assignedWeapon: WeaponSystem | null;
};

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

    const positionIds = positions.map((position) => position.id);
    const assignedWeapons =
      await this.findCanonicalAssignedWeapons(positionIds);
    const incomingDeployments = await this.findIncomingDeployments(positionIds);

    const result: Array<
      OperationalFirePosition & {
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
      const assignedWeapon = assignedWeapons.get(position.id) ?? null;
      const incomingDeployment = incomingDeployments.get(position.id) ?? null;
      const incomingWeapon = incomingDeployment?.weaponSystem ?? null;
      const effectiveUnitId = this.resolveEffectiveUnitId(
        position,
        assignedWeapon,
        incomingWeapon,
      );
      const isOwnScope =
        allowedUnitIds === null ||
        (!!effectiveUnitId && allowedUnitIds.includes(effectiveUnitId));

      const operationalPosition = this.toOperationalFirePosition(
        position,
        assignedWeapon,
      );

      result.push({
        ...operationalPosition,
        assignedWeapon: isOwnScope ? assignedWeapon : null,
        operationalState: {
          ...operationalPosition.operationalState,
          assignedWeapon: isOwnScope ? assignedWeapon : null,
        },
        incomingWeapon: isOwnScope ? incomingWeapon : null,
        incomingDeployment: isOwnScope ? incomingDeployment : null,
        aggregateReady: operationalPosition.operationalState.ready,
        aggregateReadinessReasons: operationalPosition.operationalState
          .reasonCode
          ? [operationalPosition.operationalState.reasonCode]
          : [],
        canEdit:
          isOwnScope && (user.role === 'admin' || user.role === 'operator'),
        isOwnScope,
        publicViewOnly: !isOwnScope,
      });
    }

    return result;
  }

  async findOne(id: string): Promise<OperationalFirePosition> {
    const item = await this.findEntity(id);
    const assignedWeapon = await this.findCanonicalAssignedWeapon(
      this.dataSource.getRepository(WeaponSystem),
      id,
    );

    return this.toOperationalFirePosition(item, assignedWeapon);
  }

  private async findEntity(id: string): Promise<FirePosition> {
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

    const sector = deriveFirePositionSector(
      data.mainDirectionUnits,
      data.traverseLeftUnits,
      data.traverseRightUnits,
    );
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
        notReadyReason: isFirePosition ? null : (data.notReadyReason ?? null),
        ...sector,
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
    const item = await this.findEntity(id);
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

    const sector = deriveFirePositionSector(
      mainDirectionUnits,
      traverseLeftUnits,
      traverseRightUnits,
    );
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
      ...sector,
    });
    const saved = await this.repository.save(item);
    this.emitFirePositionChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const item = await this.findEntity(id);

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
    const assignedWeapon = await this.findCanonicalAssignedWeapon(
      this.dataSource.getRepository(WeaponSystem),
      id,
    );
    const incomingDeployment = await this.findIncomingDeployment(id);
    const incomingWeapon = incomingDeployment?.weaponSystem ?? null;

    const operationalFirePosition = this.toOperationalFirePosition(
      firePosition,
      assignedWeapon,
    );

    const ammoDepotId = firePosition.ammoDepotId;

    if (!ammoDepotId) {
      return {
        firePosition: {
          ...operationalFirePosition,
          unit: assignedWeapon?.unit ?? operationalFirePosition.unit,
        },
        assignedWeapon,
        incomingWeapon,
        incomingDeployment,
        aggregateReady: operationalFirePosition.operationalState.ready,
        aggregateReadinessReasons: operationalFirePosition.operationalState
          .reasonCode
          ? [operationalFirePosition.operationalState.reasonCode]
          : [],
        localStock: {
          shells: [],
          charges: [],
          fuzes: [],
          primers: [],
        },
        lastSupplyAt: null,
        completedRequestsCount: operationalFirePosition.completedVgzCount ?? 0,
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
        ...operationalFirePosition,
        unit: assignedWeapon?.unit ?? operationalFirePosition.unit,
      },
      assignedWeapon,
      incomingWeapon,
      incomingDeployment,
      aggregateReady: operationalFirePosition.operationalState.ready,
      aggregateReadinessReasons: operationalFirePosition.operationalState
        .reasonCode
        ? [operationalFirePosition.operationalState.reasonCode]
        : [],
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
      completedRequestsCount: operationalFirePosition.completedVgzCount ?? 0,
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
    const where:
      | FindOptionsWhere<FirePosition>
      | FindOptionsWhere<FirePosition>[] =
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

    const positionIds = positions.map((position) => position.id);
    const assignedWeapons =
      await this.findCanonicalAssignedWeapons(positionIds);
    const incomingDeployments = await this.findIncomingDeployments(positionIds);
    const maxSectorDistances = await this.getMaxSectorDistancesForPositions(
      positions,
      assignedWeapons,
    );

    const result: Array<
      OperationalFirePosition & {
        maxSectorDistanceM: number;
        assignedWeapon: WeaponSystem | null;
        incomingWeapon: WeaponSystem | null;
        incomingDeployment: WeaponDeployment | null;
        aggregateReady: boolean;
        aggregateReadinessReasons: FireReadinessReason[];
      }
    > = [];

    for (const position of positions) {
      const assignedWeapon = assignedWeapons.get(position.id) ?? null;
      const operationalPosition = this.toOperationalFirePosition(
        position,
        assignedWeapon,
      );
      const incomingDeployment = incomingDeployments.get(position.id) ?? null;
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

      const maxSectorDistanceM = maxSectorDistances.get(position.id) ?? 0;

      result.push({
        ...operationalPosition,
        maxSectorDistanceM,
        assignedWeapon,
        incomingWeapon,
        incomingDeployment,
        aggregateReady: operationalPosition.operationalState.ready,
        aggregateReadinessReasons: operationalPosition.operationalState
          .reasonCode
          ? [operationalPosition.operationalState.reasonCode]
          : [],
      });
    }

    return result;
  }

  private async getMaxSectorDistancesForPositions(
    positions: FirePosition[],
    assignedWeapons: Map<string, WeaponSystem>,
  ): Promise<Map<string, number>> {
    const depotIds = Array.from(
      new Set(
        positions
          .map((position) => position.ammoDepotId)
          .filter((id): id is string => !!id),
      ),
    );
    const weaponModelIds = Array.from(
      new Set(
        Array.from(assignedWeapons.values())
          .map((weapon) => weapon.weaponModelId)
          .filter(Boolean),
      ),
    );
    const activeKits =
      weaponModelIds.length > 0
        ? await this.dataSource.getRepository(ShotConfiguration).find({
            where: {
              weaponModelId: In(weaponModelIds),
              isActive: true,
            },
          })
        : [];
    const maxKitRangeByModel = new Map<string, number>();
    for (const kit of activeKits) {
      maxKitRangeByModel.set(
        kit.weaponModelId,
        Math.max(
          maxKitRangeByModel.get(kit.weaponModelId) ?? 0,
          Number(kit.maxRangeM),
        ),
      );
    }
    const result = new Map<string, number>();
    for (const position of positions) {
      const weapon = assignedWeapons.get(position.id);
      const kitRange = weapon
        ? (maxKitRangeByModel.get(weapon.weaponModelId) ?? 0)
        : 0;
      if (kitRange > 0) {
        result.set(position.id, kitRange);
      }
    }
    if (depotIds.length === 0) {
      return result;
    }

    const [shellStock, chargeStock] = await Promise.all([
      this.dataSource.getRepository(DepotShellStock).find({
        where: { depotId: In(depotIds) },
      }),
      this.dataSource.getRepository(DepotChargeStock).find({
        where: { depotId: In(depotIds) },
      }),
    ]);
    const shellIds = Array.from(
      new Set(shellStock.map((item) => item.shellId)),
    );
    const chargeIds = Array.from(
      new Set(chargeStock.map((item) => item.chargeId)),
    );
    if (shellIds.length === 0 || chargeIds.length === 0) {
      return result;
    }

    const compatibleRanges = await this.dataSource
      .getRepository(ShellCompatibleCharge)
      .createQueryBuilder('compatibility')
      .where('compatibility.shellId IN (:...shellIds)', { shellIds })
      .andWhere('compatibility.chargeId IN (:...chargeIds)', { chargeIds })
      .getMany();
    const shellsByDepot = this.groupStockIdsByDepot(
      shellStock,
      (item) => item.shellId,
    );
    const chargesByDepot = this.groupStockIdsByDepot(
      chargeStock,
      (item) => item.chargeId,
    );
    for (const position of positions) {
      if ((result.get(position.id) ?? 0) > 0) {
        continue;
      }
      if (!position.ammoDepotId) {
        continue;
      }
      const depotShells = shellsByDepot.get(position.ammoDepotId) ?? new Set();
      const depotCharges =
        chargesByDepot.get(position.ammoDepotId) ?? new Set();
      const ranges = compatibleRanges
        .filter(
          (item) =>
            depotShells.has(item.shellId) && depotCharges.has(item.chargeId),
        )
        .map((item) => Number(item.maxRangeM));
      result.set(position.id, ranges.length > 0 ? Math.max(...ranges) : 0);
    }

    return result;
  }

  private groupStockIdsByDepot<T extends { depotId: string }>(
    stock: T[],
    getItemId: (item: T) => string,
  ): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const item of stock) {
      const ids = result.get(item.depotId) ?? new Set<string>();
      ids.add(getItemId(item));
      result.set(item.depotId, ids);
    }
    return result;
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

  private async findIncomingDeployments(
    firePositionIds: string[],
  ): Promise<Map<string, WeaponDeployment>> {
    if (firePositionIds.length === 0) {
      return new Map();
    }

    const deployments = await this.dataSource
      .getRepository(WeaponDeployment)
      .find({
        where: {
          toLocationType: 'fire_position',
          toLocationId: In(firePositionIds),
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

    const result = new Map<string, WeaponDeployment>();
    for (const deployment of deployments) {
      if (deployment.toLocationId && !result.has(deployment.toLocationId)) {
        result.set(deployment.toLocationId, deployment);
      }
    }
    return result;
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

  private async findCanonicalAssignedWeapon(
    repository: Repository<WeaponSystem>,
    firePositionId: string,
  ): Promise<WeaponSystem | null> {
    return repository.findOne({
      where: {
        currentFirePositionId: firePositionId,
        deploymentStatus: 'at_fire_position',
        isArchived: false,
      },
      relations: {
        weaponModel: true,
        unit: true,
        maintenances: true,
      },
    });
  }

  private async findCanonicalAssignedWeapons(
    firePositionIds: string[],
  ): Promise<Map<string, WeaponSystem>> {
    if (firePositionIds.length === 0) {
      return new Map();
    }

    const weapons = await this.dataSource.getRepository(WeaponSystem).find({
      where: {
        currentFirePositionId: In(firePositionIds),
        deploymentStatus: 'at_fire_position',
        isArchived: false,
      },
      relations: {
        weaponModel: true,
        unit: true,
        maintenances: true,
      },
      order: { updatedAt: 'DESC' },
    });

    const result = new Map<string, WeaponSystem>();
    for (const weapon of weapons) {
      if (
        weapon.currentFirePositionId &&
        !result.has(weapon.currentFirePositionId)
      ) {
        result.set(weapon.currentFirePositionId, weapon);
      }
    }
    return result;
  }

  private async findScopedPositionIdsFromWeapons(
    allowedUnitIds: string[],
  ): Promise<string[]> {
    const canonicalWeapons = await this.dataSource
      .getRepository(WeaponSystem)
      .find({
        where: {
          deploymentStatus: 'at_fire_position',
          unitId: In(allowedUnitIds),
          isArchived: false,
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
  ): 'threat' | 'damaged' | 'prohibited' | 'other' {
    if (
      value === 'threat' ||
      value === 'damaged' ||
      value === 'prohibited' ||
      value === 'other'
    ) {
      return value;
    }

    throw new BadRequestException('Потрібно вказати причину НЕ БГ для ВП');
  }

  private toOperationalFirePosition(
    firePosition: FirePosition,
    assignedWeapon: WeaponSystem | null,
  ): OperationalFirePosition {
    const operationalState = deriveFirePositionOperationalState(
      firePosition,
      assignedWeapon,
    );

    return {
      ...firePosition,
      unitId: assignedWeapon?.unitId ?? firePosition.unitId,
      unit: assignedWeapon?.unit ?? firePosition.unit,
      hasSg: !!assignedWeapon,
      readinessStatus: operationalState.ready
        ? 'combat_ready'
        : 'not_combat_ready',
      notReadyReason: operationalState.reasonLabel,
      assignedWeapon,
      operationalState,
    };
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
}
