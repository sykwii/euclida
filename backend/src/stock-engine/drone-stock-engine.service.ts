import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  DataSource,
  QueryFailedError,
  Repository,
} from 'typeorm';
import type { AuthUser } from '../auth/auth-user.types';
import { AirAssetPosition } from '../air-assets/air-asset-position.entity';
import { Depot } from '../depots/depot.entity';
import { DroneStockMovement } from '../drone-logistics/drone-stock-movement.entity';
import { EventLogsService } from '../event-logs/event-logs.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { DroneLocationStockAdapter } from './adapters/drone-location-stock.adapter';
import type {
  DroneStockOperationRequest,
  DroneStorageRef,
} from './drone-stock-engine.types';
import { StockOperation } from './stock-operation.entity';

@Injectable()
export class DroneStockEngineService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StockOperation)
    private readonly operations: Repository<StockOperation>,
    @InjectRepository(DroneStockMovement)
    private readonly movements: Repository<DroneStockMovement>,
    private readonly adapter: DroneLocationStockAdapter,
    private readonly realtime: RealtimeEventsService,
    private readonly eventLogs: EventLogsService,
  ) {}

  async execute(
    input: DroneStockOperationRequest,
    user: AuthUser,
  ): Promise<DroneStockMovement> {
    this.validate(input);

    const existing = await this.movements.findOne({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      return existing;
    }

    try {
      const movement = await this.dataSource.transaction(async (manager) => {
        const duplicate = await manager.findOne(DroneStockMovement, {
          where: { idempotencyKey: input.idempotencyKey },
        });

        if (duplicate) {
          return duplicate;
        }

        await this.validateStorage(manager, input.source);
        await this.validateStorage(manager, input.destination);

        const movementGroupId = randomUUID();

        const operation = await manager.save(
          StockOperation,
          manager.create(StockOperation, {
            idempotencyKey: input.idempotencyKey,
            operationType: input.operationType,
            movementGroupId,
            fromDepotId:
              input.source?.storageType === 'depot'
                ? input.source.storageId
                : null,
            toDepotId:
              input.destination?.storageType === 'depot'
                ? input.destination.storageId
                : null,
            documentNumber: null,
            comment: input.comment ?? null,
            payload: input as unknown as Record<string, unknown>,
            createdByUserId: user.sub,
            sourceStorageType: input.source?.storageType ?? null,
            sourceStorageId: input.source?.storageId ?? null,
            destinationStorageType:
              input.destination?.storageType ?? null,
            destinationStorageId:
              input.destination?.storageId ?? null,
          }),
        );

        if (input.operationType === 'correction') {
          if (!input.destination) {
            throw new BadRequestException(
              'Для корекції потрібне місце зберігання',
            );
          }

          await this.adapter.setQuantity(
            manager,
            input.destination,
            input.resourceType,
            input.resourceId,
            input.quantity,
          );
        } else {
          if (input.source) {
            await this.adapter.decrease(
              manager,
              input.source,
              input.resourceType,
              input.resourceId,
              input.quantity,
            );
          }

          if (input.destination) {
            await this.adapter.increase(
              manager,
              input.destination,
              input.resourceType,
              input.resourceId,
              input.quantity,
            );
          }
        }

        return manager.save(
          DroneStockMovement,
          manager.create(DroneStockMovement, {
            movementType: input.movementType,
            itemType: input.resourceType,
            depotFromId:
              input.source?.storageType === 'depot'
                ? input.source.storageId
                : null,
            depotToId:
              input.destination?.storageType === 'depot'
                ? input.destination.storageId
                : null,
            airAssetFromId:
              input.source?.storageType === 'air_asset'
                ? input.source.storageId
                : null,
            airAssetToId:
              input.destination?.storageType === 'air_asset'
                ? input.destination.storageId
                : null,
            droneModelId:
              input.resourceType === 'drone'
                ? input.resourceId
                : null,
            warheadTypeId:
              input.resourceType === 'warhead'
                ? input.resourceId
                : null,
            quantity: input.quantity,
            comment: input.comment ?? null,
            createdById: user.sub,
            movementGroupId,
            stockOperationId: operation.id,
            idempotencyKey: input.idempotencyKey,
          }),
        );
      });

      await this.eventLogs.create({
        eventType: 'stock',
        action: input.operationType,
        actor: user,
        unitId: input.unitId ?? user.unitId ?? null,
        entityType: 'drone_stock_movement',
        entityId: movement.id,
        title: 'Проведено рух ресурсу БпЛА',
        details: input.comment ?? null,
        metadata: {
          movementType: input.movementType,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          quantity: input.quantity,
        },
      });

      this.realtime.emitMany(
        ['stock', 'logistics', 'analytics', 'events'],
        'moved',
        {
          entity: 'drone_stock_movement',
          id: movement.id,
          unitId: input.unitId ?? user.unitId ?? undefined,
          reason: input.movementType,
        },
      );

      return movement;
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        const duplicate = await this.movements.findOne({
          where: { idempotencyKey: input.idempotencyKey },
        });

        if (duplicate) {
          return duplicate;
        }
      }

      throw error;
    }
  }

  private validate(input: DroneStockOperationRequest): void {
    const quantity = Number(input.quantity);

    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey обов’язковий');
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException('Некоректна кількість');
    }

    if (
      input.operationType !== 'correction' &&
      quantity <= 0
    ) {
      throw new BadRequestException('Кількість має бути більше 0');
    }

    if (!input.source && !input.destination) {
      throw new BadRequestException(
        'Потрібно вказати джерело або отримувача',
      );
    }
  }

  private async validateStorage(
    manager: import('typeorm').EntityManager,
    storage?: DroneStorageRef | null,
  ): Promise<void> {
    if (!storage) {
      return;
    }

    if (storage.storageType === 'depot') {
      const depot = await manager.findOne(Depot, {
        where: { id: storage.storageId },
      });

      if (!depot) {
        throw new NotFoundException('Склад БпЛА не знайдено');
      }

      if (depot.depotType !== 'drone_depot') {
        throw new BadRequestException(
          'Ресурси БпЛА дозволені тільки на складах БпЛА',
        );
      }

      return;
    }

    const position = await manager.findOne(AirAssetPosition, {
      where: { id: storage.storageId },
    });

    if (!position) {
      throw new NotFoundException(
        'Розрахунок повітряних засобів не знайдено',
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const typed = error as QueryFailedError & {
      driverError?: { code?: string };
    };

    return typed.driverError?.code === '23505';
  }
}
