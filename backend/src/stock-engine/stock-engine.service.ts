import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  DataSource,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { Depot } from '../depots/depot.entity';
import { EventLogsService } from '../event-logs/event-logs.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { StockMovement } from '../stock-movements/stock-movement.entity';
import { AmmoStockAdapter } from './adapters/ammo-stock.adapter';
import { DroneStockAdapter } from './adapters/drone-stock.adapter';
import type {
  StorageLocationRef,
  StockResourceType,
} from './contracts';
import type { StockAdapter } from './stock-adapter.interface';
import { StockOperation } from './stock-operation.entity';
import type { StockOperationRequest } from './stock-operation.types';

interface TransactionResult {
  operation: StockOperation;
  created: boolean;
}

@Injectable()
export class StockEngineService {
  private readonly adapters: StockAdapter[];

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,

    @InjectRepository(StockOperation)
    private readonly operations: Repository<StockOperation>,

    @InjectRepository(StockMovement)
    private readonly movements: Repository<StockMovement>,

    private readonly ammoAdapter: AmmoStockAdapter,
    private readonly droneAdapter: DroneStockAdapter,
    private readonly accessScope: AccessScopeService,
    private readonly realtime: RealtimeEventsService,
    private readonly eventLogs: EventLogsService,
  ) {
    this.adapters = [ammoAdapter, droneAdapter];
  }

  async listDepotBalances(depotId: string, user: AuthUser) {
    const depot = await this.requireVisibleDepot(depotId, user);

    return this.dataSource.transaction(async (manager) => ({
      depot,
      items: (
        await Promise.all(
          this.adapters.map((adapter) =>
            adapter.listByDepot(manager, depotId),
          ),
        )
      ).flat(),
    }));
  }

  async history(
    depotId: string,
    resourceType: StockResourceType,
    resourceId: string,
    user: AuthUser,
  ): Promise<StockMovement[]> {
    await this.requireVisibleDepot(depotId, user);

    return this.movements.find({
      where: [
        {
          fromDepotId: depotId,
          itemType: resourceType,
          itemId: resourceId,
        },
        {
          toDepotId: depotId,
          itemType: resourceType,
          itemId: resourceId,
        },
      ],
      relations: {
        fromDepot: true,
        toDepot: true,
      },
      order: {
        movementDatetime: 'DESC',
      },
    });
  }

  async execute(
    input: StockOperationRequest,
    user: AuthUser,
  ): Promise<StockOperation> {
    const request = this.normalizeRequest(input);
    this.validateOperation(request);

    const existing = await this.operations.findOne({
      where: { idempotencyKey: request.idempotencyKey },
    });

    if (existing) {
      return existing;
    }

    let transactionResult: TransactionResult;

    try {
      transactionResult = await this.dataSource.transaction(
        async (manager): Promise<TransactionResult> => {
          const duplicate = await manager.findOne(StockOperation, {
            where: { idempotencyKey: request.idempotencyKey },
          });

          if (duplicate) {
            return {
              operation: duplicate,
              created: false,
            };
          }

          const fromDepot = request.source
            ? await manager.findOne(Depot, {
                where: { id: request.source.id },
                lock: { mode: 'pessimistic_read' },
              })
            : null;

          const toDepot = request.destination
            ? await manager.findOne(Depot, {
                where: { id: request.destination.id },
                lock: { mode: 'pessimistic_read' },
              })
            : null;

          if (request.source && !fromDepot) {
            throw new NotFoundException('РЎРєР»Р°Рґ-РІС–РґРїСЂР°РІРЅРёРє РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
          }

          if (request.destination && !toDepot) {
            throw new NotFoundException('РЎРєР»Р°Рґ-РѕС‚СЂРёРјСѓРІР°С‡ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
          }

          await this.ensureCanOperate(user, fromDepot, toDepot);

          const movementGroupId = randomUUID();

          const operation = await manager.save(
            StockOperation,
            manager.create(StockOperation, {
              idempotencyKey: request.idempotencyKey,
              operationType: request.operationType,
              movementGroupId,
              fromDepotId: request.source?.id ?? null,
              toDepotId: request.destination?.id ?? null,
              documentNumber: request.documentNumber ?? null,
              comment: request.comment ?? null,
              payload: {
                ...request,
                movementType: input.movementType ?? null,
                fromDepotId: request.source?.id ?? null,
                toDepotId: request.destination?.id ?? null,
              },
              createdByUserId: user.sub,
            }),
          );

          const normalizedResources = this.aggregate(request.resources);

          for (const item of normalizedResources) {
            const adapter = this.adapter(item.resourceType);
            const accountingUnit =
              item.accountingUnit ??
              (await adapter.defaultAccountingUnit(
                item.resourceType,
                item.resourceId,
                manager,
              ));

            if (request.source) {
              await adapter.decrease(
                manager,
                request.source.id,
                item.resourceType,
                item.resourceId,
                item.quantity,
              );
            }

            if (request.destination) {
              await adapter.increase(
                manager,
                request.destination.id,
                item.resourceType,
                item.resourceId,
                item.quantity,
              );
            }

            await manager.save(
              StockMovement,
              manager.create(StockMovement, {
                fromDepotId: request.source?.id ?? null,
                toDepotId: request.destination?.id ?? null,
                itemType: item.resourceType,
                itemId: item.resourceId,
                quantity: item.quantity,
                movementType:
                  input.movementType ?? request.operationType,
                movementGroupId,
                documentNumber: request.documentNumber ?? null,
                comment: request.comment ?? null,
                fireMissionId: null,
                accountingUnit,
                stockOperationId: operation.id,
              }),
            );
          }

          return {
            operation,
            created: true,
          };
        },
      );
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        const duplicate = await this.operations.findOne({
          where: { idempotencyKey: request.idempotencyKey },
        });

        if (duplicate) {
          return duplicate;
        }
      }

      throw error;
    }

    if (!transactionResult.created) {
      return transactionResult.operation;
    }

    await this.eventLogs.create({
      eventType: 'stock',
      action: request.operationType,
      actor: user,
      unitId: request.unitId ?? user.unitId ?? null,
      entityType: 'stock_operation',
      entityId: transactionResult.operation.id,
      title: 'РџСЂРѕРІРµРґРµРЅРѕ СЃРєР»Р°РґСЃСЊРєСѓ РѕРїРµСЂР°С†С–СЋ',
      details: request.comment ?? null,
      metadata: {
        movementGroupId:
          transactionResult.operation.movementGroupId,
        resources: request.resources,
      },
    });

    this.realtime.emitMany(
      ['stock', 'analytics', 'events'],
      'moved',
      {
        entity: 'stock_operation',
        id: transactionResult.operation.id,
        unitId: request.unitId ?? user.unitId ?? undefined,
        reason: request.reason ?? request.operationType,
      },
    );

    return transactionResult.operation;
  }

  async executeAndGetMovements(
    input: StockOperationRequest,
    user: AuthUser,
  ): Promise<StockMovement[]> {
    const operation = await this.execute(input, user);

    return this.movements.find({
      where: {
        movementGroupId: operation.movementGroupId,
      },
      relations: {
        fromDepot: true,
        toDepot: true,
      },
      order: {
        movementDatetime: 'ASC',
      },
    });
  }

  private adapter(type: StockResourceType): StockAdapter {
    const adapter = this.adapters.find((candidate) =>
      candidate.supports(type),
    );

    if (!adapter) {
      throw new BadRequestException(
        `РќРµРїС–РґС‚СЂРёРјСѓРІР°РЅРёР№ С‚РёРї СЂРµСЃСѓСЂСЃСѓ: ${type}`,
      );
    }

    return adapter;
  }

  private aggregate(
    resources: StockOperationRequest['resources'],
  ): StockOperationRequest['resources'] {
    const map = new Map<
      string,
      StockOperationRequest['resources'][number]
    >();

    for (const item of resources) {
      const quantity = Number(item.quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException(
          'РљС–Р»СЊРєС–СЃС‚СЊ РјР°С” Р±СѓС‚Рё Р±С–Р»СЊС€Рµ 0',
        );
      }

      const key =
        `${item.resourceType}:` +
        `${item.resourceId}:` +
        `${item.accountingUnit ?? ''}`;

      const previous = map.get(key);

      map.set(key, {
        ...item,
        quantity:
          Number(previous?.quantity ?? 0) + quantity,
      });
    }

    return [...map.values()];
  }

  private validateOperation(input: StockOperationRequest): void {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException(
        'idempotencyKey РѕР±РѕРІвЂ™СЏР·РєРѕРІРёР№',
      );
    }

    if (!input.resources?.length) {
      throw new BadRequestException(
        'РџРѕС‚СЂС–Р±РµРЅ С…РѕС‡Р° Р± РѕРґРёРЅ СЂРµСЃСѓСЂСЃ',
      );
    }

    if (!input.source && !input.destination) {
      throw new BadRequestException('РџРѕС‚СЂС–Р±РЅРѕ РІРєР°Р·Р°С‚Рё СЃРєР»Р°Рґ');
    }

    if (
      input.source &&
      input.destination &&
      input.source.id === input.destination.id
    ) {
      throw new BadRequestException(
        'РЎРєР»Р°РґРё РјР°СЋС‚СЊ РІС–РґСЂС–Р·РЅСЏС‚РёСЃСЏ',
      );
    }

    if (
      input.operationType === 'transfer' &&
      (!input.source || !input.destination)
    ) {
      throw new BadRequestException(
        'Р”Р»СЏ transfer РїРѕС‚СЂС–Р±РЅС– РѕР±РёРґРІР° СЃРєР»Р°РґРё',
      );
    }

    if (
      input.operationType === 'write_off' &&
      !input.source
    ) {
      throw new BadRequestException(
        'Р”Р»СЏ write_off РїРѕС‚СЂС–Р±РµРЅ СЃРєР»Р°Рґ-РґР¶РµСЂРµР»Рѕ',
      );
    }

    if (
      input.operationType === 'receipt' &&
      !input.destination
    ) {
      throw new BadRequestException(
        'Р”Р»СЏ receipt РїРѕС‚СЂС–Р±РµРЅ СЃРєР»Р°Рґ-РѕС‚СЂРёРјСѓРІР°С‡',
      );
    }
  }

  private normalizeRequest(
    input: StockOperationRequest,
  ): StockOperationRequest {
    const source =
      input.source ??
      this.normalizeDepotLocation(input.fromDepotId ?? null);
    const destination =
      input.destination ??
      this.normalizeDepotLocation(input.toDepotId ?? null);

    this.assertDepotLocation(source, 'source');
    this.assertDepotLocation(destination, 'destination');

    return {
      ...input,
      source,
      destination,
      fromDepotId: source?.id ?? null,
      toDepotId: destination?.id ?? null,
    };
  }

  private normalizeDepotLocation(
    depotId: string | null,
  ): StorageLocationRef | null {
    if (!depotId) {
      return null;
    }

    return {
      type: 'depot',
      id: depotId,
    };
  }

  private assertDepotLocation(
    location: StorageLocationRef | null | undefined,
    field: 'source' | 'destination',
  ): void {
    if (!location) {
      return;
    }

    if (location.type !== 'depot') {
      throw new BadRequestException(
        `${field} РїС–РґС‚СЂРёРјСѓС” С‚С–Р»СЊРєРё depot`,
      );
    }
  }

  private async requireVisibleDepot(
    depotId: string,
    user: AuthUser,
  ): Promise<Depot> {
    const depot = await this.dataSource
      .getRepository(Depot)
      .findOne({ where: { id: depotId } });

    if (!depot) {
      throw new NotFoundException('РЎРєР»Р°Рґ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
    }

    await this.ensureCanOperate(user, depot, depot);

    return depot;
  }

  private async ensureCanOperate(
    user: AuthUser,
    fromDepot: Depot | null,
    toDepot: Depot | null,
  ): Promise<void> {
    if (user.role === 'admin' || user.scope === 'main') {
      return;
    }

    const visible =
      await this.accessScope.getVisibleDepotUnitIds(user);

    if (visible === null) {
      return;
    }

    for (const depot of [fromDepot, toDepot].filter(
      Boolean,
    ) as Depot[]) {
      if (
        !depot.unitId ||
        !visible.includes(depot.unitId)
      ) {
        throw new ForbiddenException(
          'РќРµРґРѕСЃС‚Р°С‚РЅСЊРѕ РїСЂР°РІ РґР»СЏ С†СЊРѕРіРѕ СЃРєР»Р°РґСѓ',
        );
      }
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const typed = error as QueryFailedError & {
      driverError?: {
        code?: string;
      };
    };

    return typed.driverError?.code === '23505';
  }
}
