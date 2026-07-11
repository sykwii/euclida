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
import type { StockAdapter } from './stock-adapter.interface';
import { StockOperation } from './stock-operation.entity';
import type { StockOperationRequest } from './stock-operation.types';
import type { StockResourceType } from './stock-resource.types';

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
    this.validateOperation(input);

    const existing = await this.operations.findOne({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      return existing;
    }

    let transactionResult: TransactionResult;

    try {
      transactionResult = await this.dataSource.transaction(
        async (manager): Promise<TransactionResult> => {
          const duplicate = await manager.findOne(StockOperation, {
            where: { idempotencyKey: input.idempotencyKey },
          });

          if (duplicate) {
            return {
              operation: duplicate,
              created: false,
            };
          }

          const fromDepot = input.fromDepotId
            ? await manager.findOne(Depot, {
                where: { id: input.fromDepotId },
                lock: { mode: 'pessimistic_read' },
              })
            : null;

          const toDepot = input.toDepotId
            ? await manager.findOne(Depot, {
                where: { id: input.toDepotId },
                lock: { mode: 'pessimistic_read' },
              })
            : null;

          if (input.fromDepotId && !fromDepot) {
            throw new NotFoundException('Склад-відправник не знайдено');
          }

          if (input.toDepotId && !toDepot) {
            throw new NotFoundException('Склад-отримувач не знайдено');
          }

          await this.ensureCanOperate(user, fromDepot, toDepot);

          const movementGroupId = randomUUID();

          /*
           * The operation is inserted before balances are changed.
           * Its unique idempotency key serializes concurrent retries.
           * Any later error rolls the complete transaction back.
           */
          const operation = await manager.save(
            StockOperation,
            manager.create(StockOperation, {
              idempotencyKey: input.idempotencyKey,
              operationType: input.operationType,
              movementGroupId,
              fromDepotId: input.fromDepotId ?? null,
              toDepotId: input.toDepotId ?? null,
              documentNumber: input.documentNumber ?? null,
              comment: input.comment ?? null,
              payload: input as unknown as Record<string, unknown>,
              createdByUserId: user.sub,
            }),
          );

          const normalizedResources = this.aggregate(input.resources);

          for (const item of normalizedResources) {
            const adapter = this.adapter(item.resourceType);
            const accountingUnit =
              item.accountingUnit ??
              (await adapter.defaultAccountingUnit(
                item.resourceType,
                item.resourceId,
                manager,
              ));

            if (input.fromDepotId) {
              await adapter.decrease(
                manager,
                input.fromDepotId,
                item.resourceType,
                item.resourceId,
                item.quantity,
              );
            }

            if (input.toDepotId) {
              await adapter.increase(
                manager,
                input.toDepotId,
                item.resourceType,
                item.resourceId,
                item.quantity,
              );
            }

            await manager.save(
              StockMovement,
              manager.create(StockMovement, {
                fromDepotId: input.fromDepotId ?? null,
                toDepotId: input.toDepotId ?? null,
                itemType: item.resourceType,
                itemId: item.resourceId,
                quantity: item.quantity,
                movementType:
                  input.movementType ?? input.operationType,
                movementGroupId,
                documentNumber: input.documentNumber ?? null,
                comment: input.comment ?? null,
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
          where: { idempotencyKey: input.idempotencyKey },
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
      action: input.operationType,
      actor: user,
      unitId: input.unitId ?? user.unitId ?? null,
      entityType: 'stock_operation',
      entityId: transactionResult.operation.id,
      title: 'Проведено складську операцію',
      details: input.comment ?? null,
      metadata: {
        movementGroupId:
          transactionResult.operation.movementGroupId,
        resources: input.resources,
      },
    });

    this.realtime.emitMany(
      ['stock', 'analytics', 'events'],
      'moved',
      {
        entity: 'stock_operation',
        id: transactionResult.operation.id,
        unitId: input.unitId ?? user.unitId ?? undefined,
        reason: input.reason ?? input.operationType,
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
        `Непідтримуваний тип ресурсу: ${type}`,
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
          'Кількість має бути більше 0',
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
        'idempotencyKey обов’язковий',
      );
    }

    if (!input.resources?.length) {
      throw new BadRequestException(
        'Потрібен хоча б один ресурс',
      );
    }

    if (!input.fromDepotId && !input.toDepotId) {
      throw new BadRequestException('Потрібно вказати склад');
    }

    if (
      input.fromDepotId &&
      input.toDepotId &&
      input.fromDepotId === input.toDepotId
    ) {
      throw new BadRequestException(
        'Склади мають відрізнятися',
      );
    }

    if (
      input.operationType === 'transfer' &&
      (!input.fromDepotId || !input.toDepotId)
    ) {
      throw new BadRequestException(
        'Для transfer потрібні обидва склади',
      );
    }

    if (
      input.operationType === 'write_off' &&
      !input.fromDepotId
    ) {
      throw new BadRequestException(
        'Для write_off потрібен склад-джерело',
      );
    }

    if (
      input.operationType === 'receipt' &&
      !input.toDepotId
    ) {
      throw new BadRequestException(
        'Для receipt потрібен склад-отримувач',
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
      throw new NotFoundException('Склад не знайдено');
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
          'Недостатньо прав для цього складу',
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
