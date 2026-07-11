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
  DroneStockResourceRef,
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
    const resource = this.getSingleResource(input.resources);

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
              input.source?.type === 'depot'
                ? input.source.id
                : null,
            toDepotId:
              input.destination?.type === 'depot'
                ? input.destination.id
                : null,
            documentNumber: null,
            comment: input.comment ?? null,
            payload: { ...input },
            createdByUserId: user.sub,
            sourceStorageType: input.source?.type ?? null,
            sourceStorageId: input.source?.id ?? null,
            destinationStorageType:
              input.destination?.type ?? null,
            destinationStorageId:
              input.destination?.id ?? null,
          }),
        );

        if (input.operationType === 'correction') {
          if (!input.destination) {
            throw new BadRequestException(
              'Р”Р»СЏ РєРѕСЂРµРєС†С–С— РїРѕС‚СЂС–Р±РЅРµ РјС–СЃС†Рµ Р·Р±РµСЂС–РіР°РЅРЅСЏ',
            );
          }

          await this.adapter.setQuantity(
            manager,
            input.destination,
            resource.resourceType,
            resource.resourceId,
            resource.quantity,
          );
        } else {
          if (input.source) {
            await this.adapter.decrease(
              manager,
              input.source,
              resource.resourceType,
              resource.resourceId,
              resource.quantity,
            );
          }

          if (input.destination) {
            await this.adapter.increase(
              manager,
              input.destination,
              resource.resourceType,
              resource.resourceId,
              resource.quantity,
            );
          }
        }

        return manager.save(
          DroneStockMovement,
          manager.create(DroneStockMovement, {
            movementType: input.movementType,
            itemType: resource.resourceType,
            depotFromId:
              input.source?.type === 'depot'
                ? input.source.id
                : null,
            depotToId:
              input.destination?.type === 'depot'
                ? input.destination.id
                : null,
            airAssetFromId:
              input.source?.type === 'air_asset'
                ? input.source.id
                : null,
            airAssetToId:
              input.destination?.type === 'air_asset'
                ? input.destination.id
                : null,
            droneModelId:
              resource.resourceType === 'drone'
                ? resource.resourceId
                : null,
            warheadTypeId:
              resource.resourceType === 'warhead'
                ? resource.resourceId
                : null,
            quantity: resource.quantity,
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
        title: 'РџСЂРѕРІРµРґРµРЅРѕ СЂСѓС… СЂРµСЃСѓСЂСЃСѓ Р‘РїР›Рђ',
        details: input.comment ?? null,
        metadata: {
          movementType: input.movementType,
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          quantity: resource.quantity,
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
    if (!input.resources?.length) {
      throw new BadRequestException(
        'РџРѕС‚СЂС–Р±РЅРѕ РІРєР°Р·Р°С‚Рё С…РѕС‡Р° Р± РѕРґРёРЅ СЂРµСЃСѓСЂСЃ',
      );
    }

    const resource = this.getSingleResource(input.resources);
    const quantity = Number(resource.quantity);

    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey РѕР±РѕРІвЂ™СЏР·РєРѕРІРёР№');
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException('РќРµРєРѕСЂРµРєС‚РЅР° РєС–Р»СЊРєС–СЃС‚СЊ');
    }

    if (
      input.operationType !== 'correction' &&
      quantity <= 0
    ) {
      throw new BadRequestException('РљС–Р»СЊРєС–СЃС‚СЊ РјР°С” Р±СѓС‚Рё Р±С–Р»СЊС€Рµ 0');
    }

    if (!input.source && !input.destination) {
      throw new BadRequestException(
        'РџРѕС‚СЂС–Р±РЅРѕ РІРєР°Р·Р°С‚Рё РґР¶РµСЂРµР»Рѕ Р°Р±Рѕ РѕС‚СЂРёРјСѓРІР°С‡Р°',
      );
    }
  }

  private getSingleResource(
    resources: DroneStockOperationRequest['resources'],
  ): DroneStockResourceRef {
    if (resources.length !== 1) {
      throw new BadRequestException(
        'DroneStockEngineService РїС–РґС‚СЂРёРјСѓС” РѕРґРёРЅ СЂРµСЃСѓСЂСЃ РЅР° РѕРїРµСЂР°С†С–СЋ',
      );
    }

    return resources[0];
  }

  private async validateStorage(
    manager: import('typeorm').EntityManager,
    storage?: DroneStorageRef | null,
  ): Promise<void> {
    if (!storage) {
      return;
    }

    if (storage.type === 'depot') {
      const depot = await manager.findOne(Depot, {
        where: { id: storage.id },
      });

      if (!depot) {
        throw new NotFoundException('РЎРєР»Р°Рґ Р‘РїР›Рђ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
      }

      if (depot.depotType !== 'drone_depot') {
        throw new BadRequestException(
          'Р РµСЃСѓСЂСЃРё Р‘РїР›Рђ РґРѕР·РІРѕР»РµРЅС– С‚С–Р»СЊРєРё РЅР° СЃРєР»Р°РґР°С… Р‘РїР›Рђ',
        );
      }

      return;
    }

    const position = await manager.findOne(AirAssetPosition, {
      where: { id: storage.id },
    });

    if (!position) {
      throw new NotFoundException(
        'Р РѕР·СЂР°С…СѓРЅРѕРє РїРѕРІС–С‚СЂСЏРЅРёС… Р·Р°СЃРѕР±С–РІ РЅРµ Р·РЅР°Р№РґРµРЅРѕ',
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
