import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { AirAssetDroneStock } from '../../drone-logistics/air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from '../../drone-logistics/air-asset-warhead-stock.entity';
import { DepotDroneStock } from '../../drone-logistics/depot-drone-stock.entity';
import { DepotDroneWarheadStock } from '../../drone-logistics/depot-drone-warhead-stock.entity';
import type {
  DroneStockResourceType,
  DroneStorageRef,
} from '../drone-stock-engine.types';

type DroneBalance =
  | DepotDroneStock
  | DepotDroneWarheadStock
  | AirAssetDroneStock
  | AirAssetWarheadStock;

interface Config {
  entity: EntityTarget<DroneBalance>;
  storageProperty: string;
  storageColumn: string;
  resourceProperty: string;
  resourceColumn: string;
}

@Injectable()
export class DroneLocationStockAdapter {
  async getQuantity(
    manager: EntityManager,
    storage: DroneStorageRef,
    resourceType: DroneStockResourceType,
    resourceId: string,
  ): Promise<number> {
    const row = await this.lock(manager, storage, resourceType, resourceId);
    return row ? Number(row.quantity) : 0;
  }

  async increase(
    manager: EntityManager,
    storage: DroneStorageRef,
    resourceType: DroneStockResourceType,
    resourceId: string,
    quantity: number,
  ): Promise<number> {
    const cfg = this.config(storage, resourceType);
    const repo = manager.getRepository(cfg.entity);

    let row = await this.lock(
      manager,
      storage,
      resourceType,
      resourceId,
    );

    if (!row) {
      row = repo.create({
        [cfg.storageProperty]: storage.storageId,
        [cfg.resourceProperty]: resourceId,
        quantity: 0,
      } as ObjectLiteral) as DroneBalance;
    }

    row.quantity = Number(row.quantity) + quantity;
    await manager.save(cfg.entity, row);
    return Number(row.quantity);
  }

  async decrease(
    manager: EntityManager,
    storage: DroneStorageRef,
    resourceType: DroneStockResourceType,
    resourceId: string,
    quantity: number,
  ): Promise<number> {
    const cfg = this.config(storage, resourceType);
    const row = await this.lock(
      manager,
      storage,
      resourceType,
      resourceId,
    );

    if (!row) {
      throw new BadRequestException('Ресурс відсутній');
    }

    const current = Number(row.quantity);

    if (current < quantity) {
      throw new BadRequestException(
        `Недостатньо ресурсу. Доступно: ${current}, потрібно: ${quantity}`,
      );
    }

    row.quantity = current - quantity;
    await manager.save(cfg.entity, row);
    return Number(row.quantity);
  }

  async setQuantity(
    manager: EntityManager,
    storage: DroneStorageRef,
    resourceType: DroneStockResourceType,
    resourceId: string,
    quantity: number,
  ): Promise<number> {
    const cfg = this.config(storage, resourceType);
    const repo = manager.getRepository(cfg.entity);

    let row = await this.lock(
      manager,
      storage,
      resourceType,
      resourceId,
    );

    if (!row) {
      row = repo.create({
        [cfg.storageProperty]: storage.storageId,
        [cfg.resourceProperty]: resourceId,
        quantity: 0,
      } as ObjectLiteral) as DroneBalance;
    }

    row.quantity = quantity;
    await manager.save(cfg.entity, row);
    return Number(row.quantity);
  }

  private async lock(
    manager: EntityManager,
    storage: DroneStorageRef,
    resourceType: DroneStockResourceType,
    resourceId: string,
  ): Promise<DroneBalance | null> {
    const cfg = this.config(storage, resourceType);

    return manager
      .getRepository(cfg.entity)
      .createQueryBuilder('stock')
      .setLock('pessimistic_write')
      .where(`stock.${cfg.storageColumn} = :storageId`, {
        storageId: storage.storageId,
      })
      .andWhere(`stock.${cfg.resourceColumn} = :resourceId`, {
        resourceId,
      })
      .getOne() as Promise<DroneBalance | null>;
  }

  private config(
    storage: DroneStorageRef,
    resourceType: DroneStockResourceType,
  ): Config {
    if (storage.storageType === 'depot' && resourceType === 'drone') {
      return {
        entity: DepotDroneStock,
        storageProperty: 'depotId',
        storageColumn: 'depot_id',
        resourceProperty: 'droneModelId',
        resourceColumn: 'drone_model_id',
      };
    }

    if (storage.storageType === 'depot' && resourceType === 'warhead') {
      return {
        entity: DepotDroneWarheadStock,
        storageProperty: 'depotId',
        storageColumn: 'depot_id',
        resourceProperty: 'warheadTypeId',
        resourceColumn: 'warhead_type_id',
      };
    }

    if (storage.storageType === 'air_asset' && resourceType === 'drone') {
      return {
        entity: AirAssetDroneStock,
        storageProperty: 'airAssetPositionId',
        storageColumn: 'air_asset_position_id',
        resourceProperty: 'droneModelId',
        resourceColumn: 'drone_model_id',
      };
    }

    if (storage.storageType === 'air_asset' && resourceType === 'warhead') {
      return {
        entity: AirAssetWarheadStock,
        storageProperty: 'airAssetPositionId',
        storageColumn: 'air_asset_position_id',
        resourceProperty: 'warheadTypeId',
        resourceColumn: 'warhead_type_id',
      };
    }

    throw new BadRequestException('Непідтримуване місце зберігання');
  }
}
