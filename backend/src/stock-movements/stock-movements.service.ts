import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { Depot } from '../depots/depot.entity';
import { StockEngineService } from '../stock-engine/stock-engine.service';
import type {
  StockOperationType,
  StockOperationRequest,
} from '../stock-engine/stock-operation.types';
import type { StockResourceType } from '../stock-engine/contracts';
import { CreateStockMovementBatchDto } from './dto/create-stock-movement-batch.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovement } from './stock-movement.entity';

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

    private readonly stockEngine: StockEngineService,
    private readonly accessScope: AccessScopeService,
  ) {}

  async findAll(user: AuthUser): Promise<StockMovement[]> {
    const allowedUnitIds =
      await this.accessScope.getVisibleDepotUnitIds(user);

    const where =
      allowedUnitIds === null
        ? undefined
        : allowedUnitIds.length > 0
          ? [
              {
                fromDepot: {
                  unitId: In(allowedUnitIds),
                },
              },
              {
                toDepot: {
                  unitId: In(allowedUnitIds),
                },
              },
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

  async create(
    data: CreateStockMovementDto,
    user: AuthUser,
  ): Promise<StockMovement> {
    this.assertPositiveQuantity(data.quantity);

    const context = await this.resolveLegacyContext(
      data.fromDepotId,
      data.toDepotId,
      user,
    );

    const movements =
      await this.stockEngine.executeAndGetMovements(
        {
          idempotencyKey: `legacy-stock-single:${randomUUID()}`,
          operationType: context.operationType,
          movementType: context.movementType,
          source: data.fromDepotId
            ? { type: 'depot', id: data.fromDepotId }
            : null,
          destination: data.toDepotId
            ? { type: 'depot', id: data.toDepotId }
            : null,
          documentNumber: null,
          comment: data.comment ?? null,
          reason: 'legacy-stock-movement',
          unitId: context.unitId,
          resources: [
            {
              resourceType: this.toStockResourceType(data.itemType),
              resourceId: data.itemId,
              quantity: Number(data.quantity),
            },
          ],
        },
        user,
      );

    const movement = movements[0];

    if (!movement) {
      throw new BadRequestException(
        'Складську операцію проведено без руху ресурсу',
      );
    }

    return movement;
  }

  async createBatch(
    data: CreateStockMovementBatchDto,
    user: AuthUser,
  ): Promise<StockMovement[]> {
    if (!data.items?.length) {
      throw new BadRequestException(
        'Потрібно додати хоча б один ресурс',
      );
    }

    for (const item of data.items) {
      this.assertPositiveQuantity(item.quantity);
    }

    const context = await this.resolveLegacyContext(
      data.fromDepotId,
      data.toDepotId,
      user,
    );

    const documentNumber = `РБК-${Date.now()}`;

    return this.stockEngine.executeAndGetMovements(
      {
        idempotencyKey: `legacy-stock-batch:${randomUUID()}`,
        operationType: context.operationType,
        movementType: context.movementType,
        source: data.fromDepotId
          ? { type: 'depot', id: data.fromDepotId }
          : null,
        destination: data.toDepotId
          ? { type: 'depot', id: data.toDepotId }
          : null,
        documentNumber,
        comment: data.comment ?? null,
        reason: 'legacy-stock-movement-batch',
        unitId: context.unitId,
        resources: data.items
          .filter(
            (item) =>
              Boolean(item.itemId) &&
              Number(item.quantity) > 0,
          )
          .map((item) => ({
            resourceType: this.toStockResourceType(item.itemType),
            resourceId: item.itemId,
            quantity: Number(item.quantity),
          })),
      },
      user,
    );
  }

  async findGrouped(user: AuthUser) {
    const movements = await this.findAll(user);
    const groups = new Map<string, StockMovement[]>();

    for (const movement of movements) {
      const key =
        movement.movementGroupId || movement.id;

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key)!.push(movement);
    }

    return Array.from(groups.entries()).map(
      ([groupId, items]) => {
        const first = items[0];

        return {
          groupId,
          documentNumber:
            first.documentNumber || '—',
          movementDatetime:
            first.movementDatetime,
          movementType: first.movementType,
          fromDepot: first.fromDepot,
          toDepot: first.toDepot,
          comment: first.comment,
          items,
        };
      },
    );
  }

  private async resolveLegacyContext(
    fromDepotId: string | undefined,
    toDepotId: string | undefined,
    user: AuthUser,
  ): Promise<{
    operationType: StockOperationType;
    movementType: string;
    unitId: string | null;
  }> {
    if (!fromDepotId && !toDepotId) {
      throw new BadRequestException(
        'Потрібно вказати склад-відправник або склад-отримувач',
      );
    }

    if (
      fromDepotId &&
      toDepotId &&
      fromDepotId === toDepotId
    ) {
      throw new BadRequestException(
        'Склад-відправник і склад-отримувач не можуть бути однаковими',
      );
    }

    const fromDepot = fromDepotId
      ? await this.dataSource
          .getRepository(Depot)
          .findOne({ where: { id: fromDepotId } })
      : null;

    const toDepot = toDepotId
      ? await this.dataSource
          .getRepository(Depot)
          .findOne({ where: { id: toDepotId } })
      : null;

    if (fromDepotId && !fromDepot) {
      throw new BadRequestException(
        'Склад-відправник не знайдено',
      );
    }

    if (toDepotId && !toDepot) {
      throw new BadRequestException(
        'Склад-отримувач не знайдено',
      );
    }

    this.assertSameInventoryDomain(
      fromDepot,
      toDepot,
    );

    if (!fromDepot && toDepot?.depotType !== 'main_pas') {
      throw new BadRequestException(
        'Зовнішня поставка дозволена тільки на головний ПАС',
      );
    }

    await this.ensureCanMoveBetweenDepots(
      user,
      fromDepot,
      toDepot,
    );

    return {
      operationType: fromDepot
        ? 'transfer'
        : 'receipt',
      movementType: fromDepot
        ? 'transfer'
        : 'external_supply',
      unitId:
        toDepot?.unitId ??
        fromDepot?.unitId ??
        user.unitId ??
        null,
    };
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
      throw new ForbiddenException(
        'Зовнішні поставки доступні тільки головному рівню',
      );
    }

    const visibleUnitIds =
      await this.accessScope.getVisibleDepotUnitIds(user);

    if (visibleUnitIds === null) {
      return;
    }

    for (const depot of [fromDepot, toDepot].filter(
      Boolean,
    ) as Depot[]) {
      if (
        !depot.unitId ||
        !visibleUnitIds.includes(depot.unitId)
      ) {
        throw new ForbiddenException(
          'Недостатньо прав для переміщення по цьому складу',
        );
      }
    }
  }

  private assertPositiveQuantity(quantity: number): void {
    const value = Number(quantity);

    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(
        'Кількість має бути більше 0',
      );
    }
  }

  private toStockResourceType(value: string): StockResourceType {
    switch (value) {
      case 'shell':
      case 'charge':
      case 'fuze':
      case 'primer':
        return value;
      default:
        throw new BadRequestException(
          'Непідтримуваний тип ресурсу складу',
        );
    }
  }

  private assertSameInventoryDomain(
    fromDepot: Depot | null,
    toDepot: Depot | null,
  ): void {
    if (fromDepot) {
      this.assertAllowedDepotType(fromDepot);
    }

    if (toDepot) {
      this.assertAllowedDepotType(toDepot);
    }
  }

  private assertAllowedDepotType(depot: Depot): void {
    if (!AMMO_DEPOT_TYPES.has(depot.depotType)) {
      throw new BadRequestException(
        'БК можна переміщувати тільки між складами БК/ПАС',
      );
    }
  }
}
