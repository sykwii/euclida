import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AirAssetDroneStock } from './air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from './air-asset-warhead-stock.entity';
import { DepotDroneStock } from './depot-drone-stock.entity';
import { DepotDroneWarheadStock } from './depot-drone-warhead-stock.entity';
import { DroneLogisticsSchemaService } from './drone-logistics-schema.service';
import { DroneStockMovement } from './drone-stock-movement.entity';

@Injectable()
export class DroneInventoryService {
  constructor(
    @InjectRepository(DepotDroneStock)
    private readonly depotDroneStock: Repository<DepotDroneStock>,
    @InjectRepository(DepotDroneWarheadStock)
    private readonly depotWarheadStock: Repository<DepotDroneWarheadStock>,
    @InjectRepository(AirAssetDroneStock)
    private readonly airAssetDroneStock: Repository<AirAssetDroneStock>,
    @InjectRepository(AirAssetWarheadStock)
    private readonly airAssetWarheadStock: Repository<AirAssetWarheadStock>,
    @InjectRepository(DroneStockMovement)
    private readonly movements: Repository<DroneStockMovement>,
    private readonly schema: DroneLogisticsSchemaService,
  ) {}

  async getDepotDroneStock(depotId?: string): Promise<DepotDroneStock[]> {
    await this.schema.ensureDroneLogisticsSchema();

    return this.schema.withDatabaseRetry(() =>
      this.depotDroneStock.find({
        where: depotId ? { depotId } : {},
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async getDepotWarheadStock(
    depotId?: string,
  ): Promise<DepotDroneWarheadStock[]> {
    await this.schema.ensureDroneLogisticsSchema();

    return this.schema.withDatabaseRetry(() =>
      this.depotWarheadStock.find({
        where: depotId ? { depotId } : {},
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async getAirAssetDroneStock(
    airAssetPositionId?: string,
  ): Promise<AirAssetDroneStock[]> {
    await this.schema.ensureDroneLogisticsSchema();

    return this.schema.withDatabaseRetry(() =>
      this.airAssetDroneStock.find({
        where: airAssetPositionId ? { airAssetPositionId } : {},
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async getAirAssetWarheadStock(
    airAssetPositionId?: string,
  ): Promise<AirAssetWarheadStock[]> {
    await this.schema.ensureDroneLogisticsSchema();

    return this.schema.withDatabaseRetry(() =>
      this.airAssetWarheadStock.find({
        where: airAssetPositionId ? { airAssetPositionId } : {},
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async getMovements(): Promise<DroneStockMovement[]> {
    await this.schema.ensureDroneLogisticsSchema();
    return this.schema.withDatabaseRetry(() =>
      this.movements.find({ order: { createdAt: 'DESC' }, take: 200 }),
    );
  }

  async getDepotDroneStockRow(
    depotId: string,
    droneModelId: string,
  ): Promise<DepotDroneStock> {
    await this.schema.ensureDroneLogisticsSchema();
    const row = await this.depotDroneStock.findOne({ where: { depotId, droneModelId } });

    if (!row) {
      throw new NotFoundException('Запис залишку дронів на складі не знайдено');
    }

    return row;
  }

  async getDepotWarheadStockRow(
    depotId: string,
    warheadTypeId: string,
  ): Promise<DepotDroneWarheadStock> {
    await this.schema.ensureDroneLogisticsSchema();
    const row = await this.depotWarheadStock.findOne({
      where: { depotId, warheadTypeId },
    });

    if (!row) {
      throw new NotFoundException('Запис залишку бойових частин на складі не знайдено');
    }

    return row;
  }

  async getAirAssetDroneStockRow(
    airAssetPositionId: string,
    droneModelId: string,
  ): Promise<AirAssetDroneStock> {
    await this.schema.ensureDroneLogisticsSchema();
    const row = await this.airAssetDroneStock.findOne({
      where: { airAssetPositionId, droneModelId },
    });

    if (!row) {
      throw new NotFoundException('Запис залишку дронів на повітряному засобі не знайдено');
    }

    return row;
  }

  async getAirAssetWarheadStockRow(
    airAssetPositionId: string,
    warheadTypeId: string,
  ): Promise<AirAssetWarheadStock> {
    await this.schema.ensureDroneLogisticsSchema();
    const row = await this.airAssetWarheadStock.findOne({
      where: { airAssetPositionId, warheadTypeId },
    });

    if (!row) {
      throw new NotFoundException('Запис залишку бойових частин на повітряному засобі не знайдено');
    }

    return row;
  }
}
