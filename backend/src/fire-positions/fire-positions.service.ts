import { Injectable, NotFoundException } from '@nestjs/common';
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
export class FirePositionsService {
  constructor(
    @InjectRepository(FirePosition)
    private readonly repository: Repository<FirePosition>,
    private readonly accessScope: AccessScopeService,
    @InjectDataSource()
private readonly dataSource: DataSource,
private readonly realtimeEvents: RealtimeEventsService,
  ) {}

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
        where: {
          firePositionId: position.id,
        },
        relations: {
          weaponModel: true,
          unit: true,
        },
      });

const isOwnScope =
  allowedUnitIds === null ||
  !!position.unitId &&
    allowedUnitIds.includes(position.unitId);

    const syncedPosition = this.applyWeaponStateToFirePosition(
  position,
  assignedWeapon,
);

result.push({
  ...syncedPosition,
  assignedWeapon: isOwnScope ? assignedWeapon : null,
  canEdit: isOwnScope && (user.role === 'admin' || user.role === 'operator'),
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

  async create(data: CreateFirePositionDto, user: AuthUser): Promise<FirePosition> {
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
  lat,
  lng,
  mgrs,
  ammoDepotId: savedDepot.id,
  hasSg: false,
readinessStatus: 'not_ready',
notReadyReason: 'Відсутня СГ',
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

if (lat === undefined || lng === undefined || lat === null || lng === null) {
  throw new BadRequestException('Потрібно вказати lat/lng або MGRS');
}

if (!mgrs) {
  mgrs = latLngToMgrs(lat, lng);
}
  Object.assign(item, {
  ...data,
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

private emitFirePositionChanged(action: 'created' | 'updated' | 'deleted' | 'changed', id: string): void {
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
    where: {
      firePositionId: id,
    },
    relations: {
      weaponModel: true,
      unit: true,
    },
  });

const syncedFirePosition = this.applyWeaponStateToFirePosition(
  firePosition,
  assignedWeapon,
);

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
    const shellStock = await this.dataSource.getRepository(DepotShellStock).find({
  where: { depotId: ammoDepotId },
  relations: { shell: true },
});

const chargeStock = await this.dataSource.getRepository(DepotChargeStock).find({
  where: { depotId: ammoDepotId },
  relations: { charge: true },
});

const shellIds = shellStock.map((item) => item.shellId);
const chargeIds = chargeStock.map((item) => item.chargeId);

const compatibleRanges = await this.dataSource
  .getRepository(ShellCompatibleCharge)
  .createQueryBuilder('compatibility')
  .where('compatibility.shellId IN (:...shellIds)', {
    shellIds: shellIds.length ? shellIds : ['00000000-0000-0000-0000-000000000000'],
  })
  .andWhere('compatibility.chargeId IN (:...chargeIds)', {
    chargeIds: chargeIds.length ? chargeIds : ['00000000-0000-0000-0000-000000000000'],
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

  const result: Array<FirePosition & { maxSectorDistanceM: number }> = [];

  for (const position of positions) {
    const maxSectorDistanceM =
      await this.getMaxSectorDistanceForPosition(position);

    result.push({
      ...position,
      maxSectorDistanceM,
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

  const shellStock = await this.dataSource.getRepository(DepotShellStock).find({
    where: {
      depotId: position.ammoDepotId,
    },
  });

  const chargeStock = await this.dataSource.getRepository(DepotChargeStock).find({
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

  return Math.max(
    ...compatibleRanges.map((item) => Number(item.maxRangeM)),
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

private applyWeaponStateToFirePosition(
  firePosition: FirePosition,
  assignedWeapon: WeaponSystem | null,
): FirePosition {
  if (!assignedWeapon) {
    firePosition.hasSg = false;
    firePosition.readinessStatus = 'not_ready';
    firePosition.notReadyReason = 'Відсутня СГ';

    return firePosition;
  }

  firePosition.hasSg = true;
  firePosition.unitId = assignedWeapon.unitId;
  firePosition.unit = assignedWeapon.unit ?? firePosition.unit;

  firePosition.readinessStatus =
    assignedWeapon.readinessStatus === 'ready' ? 'ready' : 'not_ready';

  firePosition.notReadyReason =
    assignedWeapon.readinessStatus === 'ready'
      ? null
      : assignedWeapon.readinessStatus === 'repair'
        ? 'СГ в ремонті'
        : assignedWeapon.notReadyReason || 'СГ не БГ';

  return firePosition;
}

}