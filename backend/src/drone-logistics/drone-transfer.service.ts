import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.types';
import { DroneStockEngineService } from '../stock-engine/drone-stock-engine.service';
import type {
  DroneStockOperationRequest,
  DroneStorageRef,
} from '../stock-engine/drone-stock-engine.types';
import { AirAssetDroneStock } from './air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from './air-asset-warhead-stock.entity';
import { DepotDroneStock } from './depot-drone-stock.entity';
import { DepotDroneWarheadStock } from './depot-drone-warhead-stock.entity';
import {
  AddDroneStockDto,
  AddWarheadStockDto,
  CorrectAirAssetDroneStockDto,
  CorrectAirAssetWarheadStockDto,
  TransferDroneToAirAssetDto,
  TransferWarheadToAirAssetDto,
} from './dto/drone-logistics.dto';
import { DroneInventoryService } from './drone-inventory.service';
import { DroneLogisticsSchemaService } from './drone-logistics-schema.service';
import { DroneModel } from './drone-model.entity';
import { DroneWarheadType } from './drone-warhead-type.entity';

interface OperationOptions {
  idempotencyKey?: string;
}

@Injectable()
export class DroneTransferService {
  constructor(
    @InjectRepository(DroneModel)
    private readonly droneModels: Repository<DroneModel>,
    @InjectRepository(DroneWarheadType)
    private readonly warheadTypes: Repository<DroneWarheadType>,
    private readonly schema: DroneLogisticsSchemaService,
    private readonly inventory: DroneInventoryService,
    private readonly droneStockEngine: DroneStockEngineService,
  ) {}

  async addDroneToDepot(
    data: AddDroneStockDto,
    user: AuthUser,
    options?: OperationOptions,
  ): Promise<DepotDroneStock> {
    await this.schema.ensureDroneLogisticsSchema();
    await this.ensureDroneModel(data.droneModelId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'receipt',
        movementType: 'external_supply',
        resources: [
          {
            resourceType: 'drone',
            resourceId: data.droneModelId,
            quantity: this.normalizeIntegerQuantity(data.quantity, false),
            accountingUnit: 'piece',
          },
        ],
        destination: this.depotRef(data.depotId),
        comment: this.normalizeComment(data.comment),
      },
      user,
    );

    return this.inventory.getDepotDroneStockRow(data.depotId, data.droneModelId);
  }

  async addWarheadToDepot(
    data: AddWarheadStockDto,
    user: AuthUser,
    options?: OperationOptions,
  ): Promise<DepotDroneWarheadStock> {
    await this.schema.ensureDroneLogisticsSchema();
    const warheadType = await this.ensureWarheadType(data.warheadTypeId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'receipt',
        movementType: 'external_supply',
        resources: [
          {
            resourceType: 'warhead',
            resourceId: data.warheadTypeId,
            quantity: this.normalizeWarheadQuantity(warheadType, data.quantity, false),
            accountingUnit: 'piece',
          },
        ],
        destination: this.depotRef(data.depotId),
        comment: this.normalizeComment(data.comment),
      },
      user,
    );

    return this.inventory.getDepotWarheadStockRow(data.depotId, data.warheadTypeId);
  }

  async transferDroneToAirAsset(
    data: TransferDroneToAirAssetDto,
    user: AuthUser,
    options?: OperationOptions,
  ): Promise<AirAssetDroneStock> {
    await this.schema.ensureDroneLogisticsSchema();
    await this.ensureDroneModel(data.droneModelId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'issue',
        movementType: 'depot_to_air_asset',
        resources: [
          {
            resourceType: 'drone',
            resourceId: data.droneModelId,
            quantity: this.normalizeIntegerQuantity(data.quantity, false),
            accountingUnit: 'piece',
          },
        ],
        source: this.depotRef(data.depotId),
        destination: this.airAssetRef(data.airAssetPositionId),
        comment: this.normalizeComment(data.comment),
      },
      user,
    );

    return this.inventory.getAirAssetDroneStockRow(
      data.airAssetPositionId,
      data.droneModelId,
    );
  }

  async transferWarheadToAirAsset(
    data: TransferWarheadToAirAssetDto,
    user: AuthUser,
    options?: OperationOptions,
  ): Promise<AirAssetWarheadStock> {
    await this.schema.ensureDroneLogisticsSchema();
    const warheadType = await this.ensureWarheadType(data.warheadTypeId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'issue',
        movementType: 'depot_to_air_asset',
        resources: [
          {
            resourceType: 'warhead',
            resourceId: data.warheadTypeId,
            quantity: this.normalizeWarheadQuantity(warheadType, data.quantity, false),
            accountingUnit: 'piece',
          },
        ],
        source: this.depotRef(data.depotId),
        destination: this.airAssetRef(data.airAssetPositionId),
        comment: this.normalizeComment(data.comment),
      },
      user,
    );

    return this.inventory.getAirAssetWarheadStockRow(
      data.airAssetPositionId,
      data.warheadTypeId,
    );
  }

  async correctAirAssetDroneStock(
    airAssetPositionId: string,
    data: CorrectAirAssetDroneStockDto,
    user: AuthUser,
    options?: OperationOptions,
  ): Promise<AirAssetDroneStock> {
    await this.schema.ensureDroneLogisticsSchema();

    if (!data.droneModelId) {
      throw new BadRequestException('Для корекції бортів потрібно вказати модель');
    }

    await this.ensureDroneModel(data.droneModelId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'correction',
        movementType: 'correction',
        resources: [
          {
            resourceType: 'drone',
            resourceId: data.droneModelId,
            quantity: this.normalizeIntegerQuantity(data.quantity, true),
            accountingUnit: 'piece',
          },
        ],
        destination: this.airAssetRef(airAssetPositionId),
        comment: this.normalizeComment(data.comment),
      },
      user,
    );

    return this.inventory.getAirAssetDroneStockRow(
      airAssetPositionId,
      data.droneModelId,
    );
  }

  async correctAirAssetWarheadStock(
    airAssetPositionId: string,
    data: CorrectAirAssetWarheadStockDto,
    user: AuthUser,
    options?: OperationOptions,
  ): Promise<AirAssetWarheadStock> {
    await this.schema.ensureDroneLogisticsSchema();

    if (!data.warheadTypeId) {
      throw new BadRequestException('Для корекції бойових частин потрібно вказати тип');
    }

    const warheadType = await this.ensureWarheadType(data.warheadTypeId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'correction',
        movementType: 'correction',
        resources: [
          {
            resourceType: 'warhead',
            resourceId: data.warheadTypeId,
            quantity: this.normalizeWarheadQuantity(warheadType, data.quantity, true),
            accountingUnit: 'piece',
          },
        ],
        destination: this.airAssetRef(airAssetPositionId),
        comment: this.normalizeComment(data.comment),
      },
      user,
    );

    return this.inventory.getAirAssetWarheadStockRow(
      airAssetPositionId,
      data.warheadTypeId,
    );
  }

  async returnDroneToDepot(
    airAssetPositionId: string,
    depotId: string,
    droneModelId: string,
    quantity: number,
    user: AuthUser,
    options?: OperationOptions,
  ): Promise<DepotDroneStock> {
    await this.schema.ensureDroneLogisticsSchema();
    await this.ensureDroneModel(droneModelId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'return',
        movementType: 'air_asset_to_depot',
        resources: [
          {
            resourceType: 'drone',
            resourceId: droneModelId,
            quantity: this.normalizeIntegerQuantity(quantity, false),
            accountingUnit: 'piece',
          },
        ],
        source: this.airAssetRef(airAssetPositionId),
        destination: this.depotRef(depotId),
        comment: null,
      },
      user,
    );

    return this.inventory.getDepotDroneStockRow(depotId, droneModelId);
  }

  async returnWarheadToDepot(
    airAssetPositionId: string,
    depotId: string,
    warheadTypeId: string,
    quantity: number,
    user: AuthUser,
    options?: OperationOptions,
  ): Promise<DepotDroneWarheadStock> {
    await this.schema.ensureDroneLogisticsSchema();
    const warheadType = await this.ensureWarheadType(warheadTypeId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'return',
        movementType: 'air_asset_to_depot',
        resources: [
          {
            resourceType: 'warhead',
            resourceId: warheadTypeId,
            quantity: this.normalizeWarheadQuantity(warheadType, quantity, false),
            accountingUnit: 'piece',
          },
        ],
        source: this.airAssetRef(airAssetPositionId),
        destination: this.depotRef(depotId),
        comment: null,
      },
      user,
    );

    return this.inventory.getDepotWarheadStockRow(depotId, warheadTypeId);
  }

  async writeOffDrone(
    airAssetPositionId: string,
    droneModelId: string,
    quantity: number,
    user: AuthUser,
    comment?: string | null,
    options?: OperationOptions,
  ): Promise<AirAssetDroneStock> {
    await this.schema.ensureDroneLogisticsSchema();
    await this.ensureDroneModel(droneModelId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'write_off',
        movementType: 'write_off',
        resources: [
          {
            resourceType: 'drone',
            resourceId: droneModelId,
            quantity: this.normalizeIntegerQuantity(quantity, false),
            accountingUnit: 'piece',
          },
        ],
        source: this.airAssetRef(airAssetPositionId),
        comment: this.normalizeComment(comment),
      },
      user,
    );

    return this.inventory.getAirAssetDroneStockRow(airAssetPositionId, droneModelId);
  }

  async writeOffWarhead(
    airAssetPositionId: string,
    warheadTypeId: string,
    quantity: number,
    user: AuthUser,
    comment?: string | null,
    options?: OperationOptions,
  ): Promise<AirAssetWarheadStock> {
    await this.schema.ensureDroneLogisticsSchema();
    const warheadType = await this.ensureWarheadType(warheadTypeId);

    await this.execute(
      {
        idempotencyKey: this.resolveIdempotencyKey(options),
        operationType: 'write_off',
        movementType: 'write_off',
        resources: [
          {
            resourceType: 'warhead',
            resourceId: warheadTypeId,
            quantity: this.normalizeWarheadQuantity(warheadType, quantity, false),
            accountingUnit: 'piece',
          },
        ],
        source: this.airAssetRef(airAssetPositionId),
        comment: this.normalizeComment(comment),
      },
      user,
    );

    return this.inventory.getAirAssetWarheadStockRow(
      airAssetPositionId,
      warheadTypeId,
    );
  }

  private async execute(
    input: Omit<DroneStockOperationRequest, 'unitId'>,
    user: AuthUser,
  ): Promise<void> {
    await this.droneStockEngine.execute(
      {
        ...input,
        unitId: user.unitId ?? null,
      },
      user,
    );
  }

  private async ensureDroneModel(id: string): Promise<DroneModel> {
    const model = await this.droneModels.findOne({ where: { id } });

    if (!model) {
      throw new NotFoundException('Модель дрона не знайдено');
    }

    return model;
  }

  private async ensureWarheadType(id: string): Promise<DroneWarheadType> {
    const type = await this.warheadTypes.findOne({ where: { id } });

    if (!type) {
      throw new NotFoundException('Тип бойової частини не знайдено');
    }

    return type;
  }

  private normalizeIntegerQuantity(
    value: number,
    allowZero: boolean,
  ): number {
    const quantity = Number(value);

    if (!Number.isInteger(quantity) || quantity < 0 || (!allowZero && quantity === 0)) {
      throw new BadRequestException(
        allowZero
          ? 'Кількість має бути цілим числом не менше 0'
          : 'Кількість має бути цілим числом більше 0',
      );
    }

    return quantity;
  }

  private normalizeWarheadQuantity(
    type: DroneWarheadType,
    value: number,
    allowZero: boolean,
  ): number {
    const quantity = Number(value);

    if (!Number.isFinite(quantity) || quantity < 0 || (!allowZero && quantity === 0)) {
      throw new BadRequestException(this.getWarheadQuantityError(type.measureUnit, allowZero));
    }

    if (type.measureUnit !== 'kg' && !Number.isInteger(quantity)) {
      throw new BadRequestException(this.getWarheadQuantityError(type.measureUnit, allowZero));
    }

    return Number(quantity.toFixed(3));
  }

  private getWarheadQuantityError(
    measureUnit: 'unit' | 'kg',
    allowZero: boolean,
  ): string {
    if (measureUnit === 'kg') {
      return allowZero
        ? 'Маса бойової частини має бути числом не менше 0 кг'
        : 'Маса бойової частини має бути числом більше 0 кг';
    }

    return allowZero
      ? 'Кількість бойових частин має бути цілим числом не менше 0'
      : 'Кількість бойових частин має бути цілим числом більше 0';
  }

  private normalizeComment(value?: string | null): string | null {
    return value?.trim() || null;
  }

  private resolveIdempotencyKey(options?: OperationOptions): string {
    return options?.idempotencyKey?.trim() || randomUUID();
  }

  private depotRef(storageId: string): DroneStorageRef {
    return { type: 'depot', id: storageId };
  }

  private airAssetRef(storageId: string): DroneStorageRef {
    return { type: 'air_asset', id: storageId };
  }
}
