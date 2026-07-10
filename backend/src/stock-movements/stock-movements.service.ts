import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityTarget, In, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovement } from './stock-movement.entity';
import { Depot } from '../depots/depot.entity';
import { EntityManager } from 'typeorm';
import { ObjectLiteral } from 'typeorm';
import { CreateStockMovementBatchDto } from './dto/create-stock-movement-batch.dto';
import { randomUUID } from 'crypto';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

type StockEntity =
  | DepotShellStock
  | DepotChargeStock
  | DepotFuzeStock
  | DepotPrimerStock;

const AMMO_DEPOT_TYPES = new Set([
  'main_pas',
  'division_pas',
  'battery_pas',
  'fire_position_ammo',
]);

@Injectable()
export class StockMovementsService {
  constructor(
    @InjectRepository(StockMovement)
    private readonly repository: Repository<StockMovement>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly realtimeEvents: RealtimeEventsService,

    private readonly accessScope: AccessScopeService,
  ) {}

  async findAll(user: AuthUser): Promise<StockMovement[]> {
  const allowedUnitIds = await this.accessScope.getVisibleDepotUnitIds(user);
  const where = allowedUnitIds === null
    ? undefined
    : allowedUnitIds.length > 0
      ? [
          { fromDepot: { unitId: In(allowedUnitIds) } },
          { toDepot: { unitId: In(allowedUnitIds) } },
        ]
      : [{ id: In([]) }];

  return this.repository.find({
    where,
    relations: {
      fromDepot: true,
      toDepot: true,
    },
    order: {
      movementDatetime: 'DESC',
    },
  });
}

  async create(data: CreateStockMovementDto, user: AuthUser): Promise<StockMovement> {
  this.assertPositiveQuantity(data.quantity);

  if (!data.fromDepotId && !data.toDepotId) {
    throw new BadRequestException('Потрібно вказати fromDepotId або toDepotId');
  }

  if (data.fromDepotId && data.toDepotId && data.fromDepotId === data.toDepotId) {
    throw new BadRequestException('Склад-відправник і склад-отримувач не можуть бути однаковими');
  }

  const movement = await this.dataSource.transaction(async (manager) => {
    const fromDepot = data.fromDepotId
      ? await manager.findOne(Depot, { where: { id: data.fromDepotId } })
      : null;

    const toDepot = data.toDepotId
      ? await manager.findOne(Depot, { where: { id: data.toDepotId } })
      : null;

    if (data.fromDepotId && !fromDepot) {
      throw new BadRequestException('Склад-відправник не знайдено');
    }

    if (data.toDepotId && !toDepot) {
      throw new BadRequestException('Склад-отримувач не знайдено');
    }

    this.assertSameInventoryDomain(fromDepot, toDepot);

    if (!fromDepot && toDepot?.depotType !== 'main_pas') {
      throw new BadRequestException(
        'Зовнішня поставка дозволена тільки на головний ПАС',
      );
    }

    await this.ensureCanMoveBetweenDepots(user, fromDepot, toDepot);
const movementType = !fromDepot ? 'external_supply' : 'transfer';
    if (data.fromDepotId) {
      await this.decreaseStock(manager, data);
    }

    if (data.toDepotId) {
      await this.increaseStock(manager, data);
    }

    const movement = manager.create(StockMovement, {
  ...data,
  movementType,
 
});
    return manager.save(StockMovement, movement);
  });

  this.realtimeEvents.emitMany(
  [
    'stock',
    'analytics',
    'events',
  ],
  'moved',
  {
    entity: 'stock_movement',
    id: movement.id,
  },
);

  return movement;
}

  private getStockConfig(itemType: string): {
    entity: EntityTarget<StockEntity>;
    itemColumn: string;
    depotColumn: string;
  } {
    switch (itemType) {
      case 'shell':
        return {
          entity: DepotShellStock,
          itemColumn: 'shellId',
          depotColumn: 'depotId',
        };

      case 'charge':
        return {
          entity: DepotChargeStock,
          itemColumn: 'chargeId',
          depotColumn: 'depotId',
        };

      case 'fuze':
        return {
          entity: DepotFuzeStock,
          itemColumn: 'fuzeId',
          depotColumn: 'depotId',
        };

      case 'primer':
        return {
          entity: DepotPrimerStock,
          itemColumn: 'primerId',
          depotColumn: 'depotId',
        };

      default:
        throw new BadRequestException('Невідомий тип ресурсу');
    }
  }

  

 private async increaseStock(
  manager: EntityManager,
  data: CreateStockMovementDto,
): Promise<void> {
  const config = this.getStockConfig(data.itemType);

  if (!data.toDepotId) {
    return;
  }

  let stock = await manager
    .getRepository(config.entity)
    .createQueryBuilder('stock')
    .where('stock.depot_id = :depotId', { depotId: data.toDepotId })
    .andWhere(`stock.${this.toSnakeCase(config.itemColumn)} = :itemId`, {
      itemId: data.itemId,
    })
    .getOne();

  if (!stock) {
    stock = manager.create(config.entity, {
      [config.depotColumn]: data.toDepotId,
      [config.itemColumn]: data.itemId,
      quantity: Number(data.quantity),
    } as ObjectLiteral);
  } else {
    stock.quantity = Number(stock.quantity) + data.quantity;
  }

  await manager.save(config.entity, stock);
}

private async decreaseStock(
  manager: EntityManager,
  data: CreateStockMovementDto,
): Promise<void> {
  const config = this.getStockConfig(data.itemType);

  if (!data.fromDepotId) {
    return;
  }

  const stock = await manager
    .getRepository(config.entity)
    .createQueryBuilder('stock')
    .setLock('pessimistic_write')
    .where('stock.depot_id = :depotId', { depotId: data.fromDepotId })
    .andWhere(`stock.${this.toSnakeCase(config.itemColumn)} = :itemId`, {
      itemId: data.itemId,
    })
    .getOne();

  if (!stock) {
    throw new BadRequestException('На складі-відправнику немає такого ресурсу');
  }

  const currentQuantity = Number(stock.quantity);
  const requestedQuantity = Number(data.quantity);

  if (currentQuantity < requestedQuantity) {
    throw new BadRequestException(
      `Недостатньо ресурсу на складі-відправнику. Доступно: ${currentQuantity}, потрібно: ${requestedQuantity}`,
    );
  }

  stock.quantity = currentQuantity - requestedQuantity;

  await manager.save(config.entity, stock);
}


  private toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

async createBatch(data: CreateStockMovementBatchDto, user: AuthUser): Promise<StockMovement[]> {
  if (!data.fromDepotId && !data.toDepotId) {
    throw new BadRequestException('Потрібно вказати склад-відправник або склад-отримувач');
  }

  if (data.fromDepotId && data.toDepotId && data.fromDepotId === data.toDepotId) {
    throw new BadRequestException('Склад-відправник і склад-отримувач не можуть бути однаковими');
  }

  if (!data.items || data.items.length === 0) {
    throw new BadRequestException('Потрібно додати хоча б один ресурс');
  }

  for (const item of data.items) {
    this.assertPositiveQuantity(item.quantity);
  }

  const normalizedItems = Array.from(
    data.items
      .filter((item) => item.itemId && Number(item.quantity) > 0)
      .reduce((map, item) => {
        const key = `${item.itemType}:${item.itemId}`;
        const previous = map.get(key);
        map.set(key, {
          itemType: item.itemType,
          itemId: item.itemId,
          quantity: Number(previous?.quantity ?? 0) + Number(item.quantity),
        });
        return map;
      }, new Map<string, { itemType: string; itemId: string; quantity: number }>())
      .values(),
  );

  if (normalizedItems.length === 0) {
    throw new BadRequestException('Потрібно додати хоча б один ресурс з кількістю більше 0');
  }

  const createdMovements = await this.dataSource.transaction(async (manager) => {
    const fromDepot = data.fromDepotId
      ? await manager.findOne(Depot, { where: { id: data.fromDepotId } })
      : null;

    const toDepot = data.toDepotId
      ? await manager.findOne(Depot, { where: { id: data.toDepotId } })
      : null;

    if (data.fromDepotId && !fromDepot) {
      throw new BadRequestException('Склад-відправник не знайдено');
    }

    if (data.toDepotId && !toDepot) {
      throw new BadRequestException('Склад-отримувач не знайдено');
    }

    if (!fromDepot && toDepot?.depotType !== 'main_pas') {
      throw new BadRequestException('Зовнішня поставка дозволена тільки на головний ПАС');
    }

    await this.ensureCanMoveBetweenDepots(user, fromDepot, toDepot);

    this.assertSameInventoryDomain(fromDepot, toDepot);

    const movementType = !fromDepot ? 'external_supply' : 'transfer';
    const created: StockMovement[] = [];
    const movementGroupId = randomUUID();
const documentNumber = `РБК-${new Date().getTime()}`;

    for (const item of normalizedItems) {
      const movementData: CreateStockMovementDto = {
        fromDepotId: data.fromDepotId,
        toDepotId: data.toDepotId,
        itemType: item.itemType,
        itemId: item.itemId,
        quantity: item.quantity,
        comment: data.comment,
      };

      if (movementData.fromDepotId) {
        await this.decreaseStock(manager, movementData);
      }

      if (movementData.toDepotId) {
        await this.increaseStock(manager, movementData);
      }

      const movement = manager.create(StockMovement, {
        ...movementData,
        movementType,
         movementGroupId,
  documentNumber,
      });

      const saved = await manager.save(StockMovement, movement);
      created.push(saved);
    }

    return created;
  });

  this.realtimeEvents.emitMany(
  [
    'stock',
    'analytics',
    'events',
  ],
  'moved',
  {
    entity: 'stock_movement',
  },
);

  return createdMovements;
}

async findGrouped(user: AuthUser) {
  const movements = await this.findAll(user);

  const groups = new Map<string, StockMovement[]>();

  for (const movement of movements) {
    const key = movement.movementGroupId || movement.id;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key)!.push(movement);
  }

  return Array.from(groups.entries()).map(([groupId, items]) => {
    const first = items[0];

    return {
      groupId,
      documentNumber: first.documentNumber || '—',
      movementDatetime: first.movementDatetime,
      movementType: first.movementType,
      fromDepot: first.fromDepot,
      toDepot: first.toDepot,
      comment: first.comment,
      items,
    };
  });
}

private async ensureCanMoveBetweenDepots(
  user: AuthUser,
  fromDepot: Depot | null,
  toDepot: Depot | null,
): Promise<void> {
  if (user.role === 'admin' || user.scope === 'main') {
    return;
  }

  if (!fromDepot) {
    throw new ForbiddenException('Внешние поставки доступны только главному уровню');
  }

  const visibleUnitIds = await this.accessScope.getVisibleDepotUnitIds(user);

  if (visibleUnitIds === null) {
    return;
  }

  for (const depot of [fromDepot, toDepot].filter(Boolean) as Depot[]) {
    if (!depot.unitId || !visibleUnitIds.includes(depot.unitId)) {
      throw new ForbiddenException('Недостатньо прав для переміщення по цьому складу');
    }
  }
}

private assertPositiveQuantity(quantity: number): void {
  const value = Number(quantity);

  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('Кількість має бути більше 0');
  }
}

private assertSameInventoryDomain(fromDepot: Depot | null, toDepot: Depot | null): void {
  if (fromDepot) {
    this.assertAllowedDepotType(fromDepot);
  }

  if (toDepot) {
    this.assertAllowedDepotType(toDepot);
  }
}

private assertAllowedDepotType(depot: Depot): void {
  if (!AMMO_DEPOT_TYPES.has(depot.depotType)) {
    throw new BadRequestException('БК можна переміщувати тільки між складами БК/ПАС');
  }
}

}
