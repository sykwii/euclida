import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AirAssetPosition } from '../air-assets/air-asset-position.entity';
import { Depot } from '../depots/depot.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { DroneModel } from './drone-model.entity';
import { DroneWarheadType } from './drone-warhead-type.entity';
import { DepotDroneStock } from './depot-drone-stock.entity';
import { DepotDroneWarheadStock } from './depot-drone-warhead-stock.entity';
import { AirAssetDroneStock } from './air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from './air-asset-warhead-stock.entity';
import { DroneStockMovement } from './drone-stock-movement.entity';
import {
  AddDroneStockDto,
  AddWarheadStockDto,
  CorrectAirAssetDroneStockDto,
  CorrectAirAssetWarheadStockDto,
  CreateDroneModelDto,
  CreateDroneWarheadTypeDto,
  TransferDroneToAirAssetDto,
  TransferWarheadToAirAssetDto,
} from './dto/drone-logistics.dto';

@Injectable()
export class DroneLogisticsService {
  private schemaReady?: Promise<void>;

  constructor(
    @InjectRepository(DroneModel) private readonly droneModels: Repository<DroneModel>,
    @InjectRepository(DroneWarheadType) private readonly warheadTypes: Repository<DroneWarheadType>,
    @InjectRepository(DepotDroneStock) private readonly depotDroneStock: Repository<DepotDroneStock>,
    @InjectRepository(DepotDroneWarheadStock) private readonly depotWarheadStock: Repository<DepotDroneWarheadStock>,
    @InjectRepository(AirAssetDroneStock) private readonly airAssetDroneStock: Repository<AirAssetDroneStock>,
    @InjectRepository(AirAssetWarheadStock) private readonly airAssetWarheadStock: Repository<AirAssetWarheadStock>,
    @InjectRepository(DroneStockMovement) private readonly movements: Repository<DroneStockMovement>,
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeEventsService,
  ) {
    void this.ensureDroneLogisticsSchema().catch(() => undefined);
  }

  async getDroneModels() {
    await this.ensureDroneLogisticsSchema();
    return this.droneModels.find({ order: { name: 'ASC' } });
  }

  async createDroneModel(data: CreateDroneModelDto) {
  await this.ensureDroneLogisticsSchema();

  const model = new DroneModel();
  model.name = data.name.trim();
  model.droneGroup = data.droneGroup;
  model.droneType = data.droneType;
  model.cameraType = data.cameraType ?? 'none';
  model.maxRangeM = data.maxRangeM ?? null;
  model.cruiseSpeedKmh = data.cruiseSpeedKmh ?? null;
  model.enduranceMinutes = data.enduranceMinutes ?? null;
  model.payloadCapacityKg = data.payloadCapacityKg ?? null;
  model.maxAltitudeM = data.maxAltitudeM ?? null;
  model.maxWindMs = data.maxWindMs ?? null;
  model.note = data.note?.trim() || null;

  const saved = await this.droneModels.save(model);

  this.emitChanged('created', saved.id);

  return saved;
}

  async getWarheadTypes() {
    await this.ensureDroneLogisticsSchema();
    return this.warheadTypes.find({ order: { name: 'ASC' } });
  }

  async createWarheadType(data: CreateDroneWarheadTypeDto) {
    await this.ensureDroneLogisticsSchema();
    const saved = await this.warheadTypes.save(
      this.warheadTypes.create({
        ...data,
        measureUnit: data.measureUnit ?? 'unit',
      }),
    );
    this.emitChanged('created', saved.id);
    return saved;
  }

  async getDepotDroneStock(depotId?: string) {
    await this.ensureDroneLogisticsSchema();

    return this.withDatabaseRetry(() =>
      this.depotDroneStock.find({
        where: depotId ? { depotId } : {},
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async getDepotWarheadStock(depotId?: string) {
    await this.ensureDroneLogisticsSchema();
    return this.withDatabaseRetry(() =>
      this.depotWarheadStock.find({
        where: depotId ? { depotId } : {},
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async getAirAssetDroneStock(airAssetPositionId?: string) {
    await this.ensureDroneLogisticsSchema();

    return this.withDatabaseRetry(() =>
      this.airAssetDroneStock.find({
        where: airAssetPositionId ? { airAssetPositionId } : {},
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async getAirAssetWarheadStock(airAssetPositionId?: string) {
    await this.ensureDroneLogisticsSchema();
    return this.withDatabaseRetry(() =>
      this.airAssetWarheadStock.find({
        where: airAssetPositionId ? { airAssetPositionId } : {},
        order: { updatedAt: 'DESC' },
      }),
    );
  }

  async getMovements() {
    await this.ensureDroneLogisticsSchema();
    return this.withDatabaseRetry(() => this.movements.find({ order: { createdAt: 'DESC' }, take: 200 }));
  }

  async addDroneToDepot(data: AddDroneStockDto) {
    await this.ensureDroneLogisticsSchema();
    await this.ensureDroneDepot(data.depotId);

    const quantity = this.normalizeQuantity(data.quantity);
    const stock = await this.findOrCreateDepotDroneStock(data.depotId, data.droneModelId);
    stock.quantity += quantity;
    const saved = await this.depotDroneStock.save(stock);

    await this.movements.save(this.movements.create({
      movementType: 'external_supply',
      itemType: 'drone',
      depotToId: data.depotId,
      droneModelId: data.droneModelId,
      quantity,
      comment: data.comment || null,
    }));

    this.emitChanged('updated', saved.id);
    return saved;
  }

  async addWarheadToDepot(data: AddWarheadStockDto) {
    await this.ensureDroneLogisticsSchema();
    await this.ensureDroneDepot(data.depotId);

    const quantity = await this.normalizeWarheadQuantity(data.warheadTypeId, data.quantity);
    const stock = await this.findOrCreateDepotWarheadStock(data.depotId, data.warheadTypeId);
    stock.quantity = Number(stock.quantity) + quantity;
    const saved = await this.depotWarheadStock.save(stock);

    await this.movements.save(this.movements.create({
      movementType: 'external_supply',
      itemType: 'warhead',
      depotToId: data.depotId,
      warheadTypeId: data.warheadTypeId,
      quantity,
      comment: data.comment || null,
    }));

    this.emitChanged('updated', saved.id);
    return saved;
  }

  async transferDroneToAirAsset(data: TransferDroneToAirAssetDto) {
    await this.ensureDroneLogisticsSchema();
    await this.ensureDroneDepot(data.depotId);
    await this.ensureAirAssetPosition(data.airAssetPositionId);

    const quantity = this.normalizeQuantity(data.quantity);
    const depotStock = await this.findDepotDroneStockOrFail(data.depotId, data.droneModelId);

    if (depotStock.quantity < quantity) {
      throw new BadRequestException('Недостатньо дронів на складі');
    }

    const decreaseResult = await this.depotDroneStock
      .createQueryBuilder()
      .update(DepotDroneStock)
      .set({ quantity: () => 'quantity - :quantity' })
      .where('depot_id = :depotId', { depotId: data.depotId })
      .andWhere('drone_model_id = :droneModelId', { droneModelId: data.droneModelId })
      .andWhere('quantity >= :quantity', { quantity })
      .setParameters({ quantity })
      .execute();

    if (!decreaseResult.affected) {
      throw new BadRequestException('Недостатньо БпЛА на складі');
    }

    const positionStock = await this.findOrCreateAirAssetDroneStock(data.airAssetPositionId, data.droneModelId);
    positionStock.quantity += quantity;

    const saved = await this.airAssetDroneStock.save(positionStock);

    await this.movements.save(this.movements.create({
      movementType: 'depot_to_air_asset',
      itemType: 'drone',
      depotFromId: data.depotId,
      airAssetToId: data.airAssetPositionId,
      droneModelId: data.droneModelId,
      quantity,
      comment: data.comment || null,
    }));

    this.emitChanged('updated', saved.id);
    return saved;
  }

  async transferWarheadToAirAsset(data: TransferWarheadToAirAssetDto) {
    await this.ensureDroneLogisticsSchema();
    await this.ensureDroneDepot(data.depotId);
    await this.ensureAirAssetPosition(data.airAssetPositionId);

    const quantity = await this.normalizeWarheadQuantity(data.warheadTypeId, data.quantity);
    const depotStock = await this.findDepotWarheadStockOrFail(data.depotId, data.warheadTypeId);

    if (Number(depotStock.quantity) < quantity) {
      throw new BadRequestException('Недостатньо бойових частин на складі');
    }

    const decreaseResult = await this.depotWarheadStock
      .createQueryBuilder()
      .update(DepotDroneWarheadStock)
      .set({ quantity: () => 'quantity - :quantity' })
      .where('depot_id = :depotId', { depotId: data.depotId })
      .andWhere('warhead_type_id = :warheadTypeId', { warheadTypeId: data.warheadTypeId })
      .andWhere('quantity >= :quantity', { quantity })
      .setParameters({ quantity })
      .execute();

    if (!decreaseResult.affected) {
      throw new BadRequestException('Недостатньо БЧ на складі');
    }

    const positionStock = await this.findOrCreateAirAssetWarheadStock(data.airAssetPositionId, data.warheadTypeId);
    positionStock.quantity = Number(positionStock.quantity) + quantity;

    const saved = await this.airAssetWarheadStock.save(positionStock);

    await this.movements.save(this.movements.create({
      movementType: 'depot_to_air_asset',
      itemType: 'warhead',
      depotFromId: data.depotId,
      airAssetToId: data.airAssetPositionId,
      warheadTypeId: data.warheadTypeId,
      quantity,
      comment: data.comment || null,
    }));

    this.emitChanged('updated', saved.id);
    return saved;
  }

  async correctAirAssetDroneStock(airAssetPositionId: string, data: CorrectAirAssetDroneStockDto) {
    await this.ensureDroneLogisticsSchema();

    if (!data.droneModelId) {
      throw new BadRequestException('Для корекції бортів потрібно вказати модель');
    }

    const quantity = this.normalizeCorrectionQuantity(data.quantity);
    const stock = await this.findOrCreateAirAssetDroneStock(airAssetPositionId, data.droneModelId);
    stock.quantity = quantity;
    const saved = await this.airAssetDroneStock.save(stock);

    await this.movements.save(
      this.movements.create({
        movementType: 'correction',
        itemType: 'drone',
        airAssetToId: airAssetPositionId,
        droneModelId: data.droneModelId,
        quantity,
        comment: data.comment || null,
      }),
    );

    this.emitChanged('updated', saved.id);
    return saved;
  }

  async correctAirAssetWarheadStock(
    airAssetPositionId: string,
    data: CorrectAirAssetWarheadStockDto,
  ) {
    await this.ensureDroneLogisticsSchema();
    if (!data.warheadTypeId) {
      throw new BadRequestException('Для корекції БЧ потрібно вказати тип БЧ');
    }

    const quantity = await this.normalizeWarheadCorrectionQuantity(data.warheadTypeId, data.quantity);
    const stock = await this.findOrCreateAirAssetWarheadStock(
      airAssetPositionId,
      data.warheadTypeId,
    );
    stock.quantity = quantity;
    const saved = await this.airAssetWarheadStock.save(stock);

    await this.movements.save(
      this.movements.create({
        movementType: 'correction',
        itemType: 'warhead',
        airAssetToId: airAssetPositionId,
        warheadTypeId: data.warheadTypeId,
        quantity,
        comment: data.comment || null,
      }),
    );

    this.emitChanged('updated', saved.id);
    return saved;
  }

  private emitChanged(action: 'created' | 'updated', id: string): void {
    this.realtime.emitMany(['stock', 'logistics', 'analytics'], action, {
      entity: 'drone_logistics',
      id,
    });
  }

  private async ensureDroneDepot(depotId: string): Promise<Depot> {
    const depot = await this.dataSource.getRepository(Depot).findOne({ where: { id: depotId } });

    if (!depot) {
      throw new NotFoundException('Склад БпЛА не знайдено');
    }

    if (depot.depotType !== 'drone_depot') {
      throw new BadRequestException('БпЛА та БЧ можна обліковувати тільки на складах БпЛА');
    }

    return depot;
  }

  private async ensureAirAssetPosition(airAssetPositionId: string): Promise<void> {
    const position = await this.dataSource
      .getRepository(AirAssetPosition)
      .findOne({ where: { id: airAssetPositionId } });

    if (!position) {
      throw new NotFoundException('Розрахунок повітряних засобів не знайдено');
    }
  }

  private normalizeQuantity(value: number): number {
    const quantity = Number(value);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Кількість має бути цілим числом більше 0');
    }

    return quantity;
  }

  private normalizeCorrectionQuantity(value: number): number {
    const quantity = Number(value);

    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new BadRequestException('Кількість має бути цілим числом не менше 0');
    }

    return quantity;
  }

  private async normalizeWarheadQuantity(warheadTypeId: string, value: number): Promise<number> {
    const type = await this.warheadTypes.findOne({ where: { id: warheadTypeId } });
    if (!type) {
      throw new NotFoundException('Тип БЧ не знайдений');
    }

    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException(this.getWarheadQuantityError(type.measureUnit, false));
    }

    if (type.measureUnit !== 'kg' && !Number.isInteger(quantity)) {
      throw new BadRequestException(this.getWarheadQuantityError(type.measureUnit, false));
    }

    return Number(quantity.toFixed(3));
  }

  private async normalizeWarheadCorrectionQuantity(warheadTypeId: string, value: number): Promise<number> {
    const type = await this.warheadTypes.findOne({ where: { id: warheadTypeId } });
    if (!type) {
      throw new NotFoundException('Тип БЧ не знайдений');
    }

    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException(this.getWarheadQuantityError(type.measureUnit, true));
    }

    if (type.measureUnit !== 'kg' && !Number.isInteger(quantity)) {
      throw new BadRequestException(this.getWarheadQuantityError(type.measureUnit, true));
    }

    return Number(quantity.toFixed(3));
  }

  private getWarheadQuantityError(measureUnit: 'unit' | 'kg', allowZero: boolean): string {
    if (measureUnit === 'kg') {
      return allowZero ? 'Маса БЧ має бути числом не менше 0 кг' : 'Маса БЧ має бути числом більше 0 кг';
    }

    return allowZero ? 'Кількість БЧ має бути цілим числом не менше 0' : 'Кількість БЧ має бути цілим числом більше 0';
  }

  private async ensureDroneLogisticsSchema(): Promise<void> {
    this.schemaReady ??= this.withDatabaseRetry(() => this.runDroneLogisticsSchema()).catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });

    return this.schemaReady;
  }

  private async runDroneLogisticsSchema(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS drone_models (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        drone_group VARCHAR(50) NOT NULL DEFAULT 'recon',
        drone_type VARCHAR(50) NOT NULL DEFAULT 'copter',
        camera_type VARCHAR(50) NOT NULL DEFAULT 'none',
         max_range_m INT NULL,
        cruise_speed_kmh INT NULL,
        endurance_minutes INT NULL,
        payload_capacity_kg NUMERIC(10, 3) NULL,
        max_altitude_m INT NULL,
        max_wind_ms NUMERIC(10, 2) NULL,
        note TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS drone_warhead_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        weight_kg NUMERIC(10, 2) NULL,
        measure_unit VARCHAR(20) NOT NULL DEFAULT 'unit',
        note TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS depot_drone_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        depot_id UUID NOT NULL,
        drone_model_id UUID NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS depot_drone_warhead_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        depot_id UUID NOT NULL,
        warhead_type_id UUID NOT NULL,
        quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS air_asset_drone_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        air_asset_position_id UUID NOT NULL,
        drone_model_id UUID NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS air_asset_warhead_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        air_asset_position_id UUID NOT NULL,
        warhead_type_id UUID NOT NULL,
        quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS drone_stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        movement_type VARCHAR(50) NOT NULL,
        item_type VARCHAR(50) NOT NULL,
        depot_from_id UUID NULL,
        depot_to_id UUID NULL,
        air_asset_from_id UUID NULL,
        air_asset_to_id UUID NULL,
        drone_model_id UUID NULL,
        warhead_type_id UUID NULL,
        quantity INT NOT NULL DEFAULT 0,
        comment TEXT NULL,
        created_by_id UUID NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
      ALTER TABLE drone_models
       ADD COLUMN IF NOT EXISTS max_range_m INT NULL,
      ADD COLUMN IF NOT EXISTS cruise_speed_kmh INT NULL,
      ADD COLUMN IF NOT EXISTS endurance_minutes INT NULL,
      ADD COLUMN IF NOT EXISTS payload_capacity_kg NUMERIC(10, 3) NULL,
      ADD COLUMN IF NOT EXISTS max_altitude_m INT NULL,
      ADD COLUMN IF NOT EXISTS max_wind_ms NUMERIC(10, 2) NULL,
      ADD COLUMN IF NOT EXISTS drone_group VARCHAR(50) NOT NULL DEFAULT 'recon',
      ADD COLUMN IF NOT EXISTS drone_type VARCHAR(50) NOT NULL DEFAULT 'copter',
      ADD COLUMN IF NOT EXISTS camera_type VARCHAR(50) NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS note TEXT NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE drone_warhead_types
      ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10, 2) NULL,
      ADD COLUMN IF NOT EXISTS measure_unit VARCHAR(20) NOT NULL DEFAULT 'unit',
      ADD COLUMN IF NOT EXISTS note TEXT NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE depot_drone_stock
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE depot_drone_warhead_stock
      ALTER COLUMN quantity TYPE NUMERIC(18, 3) USING quantity::numeric;
      ALTER TABLE depot_drone_warhead_stock
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE air_asset_warhead_stock
      ALTER COLUMN quantity TYPE NUMERIC(18, 3) USING quantity::numeric;
      ALTER TABLE air_asset_drone_stock
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE air_asset_warhead_stock
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE drone_stock_movements
      ADD COLUMN IF NOT EXISTS depot_from_id UUID NULL,
      ADD COLUMN IF NOT EXISTS depot_to_id UUID NULL,
      ADD COLUMN IF NOT EXISTS air_asset_from_id UUID NULL,
      ADD COLUMN IF NOT EXISTS air_asset_to_id UUID NULL,
      ADD COLUMN IF NOT EXISTS drone_model_id UUID NULL,
      ADD COLUMN IF NOT EXISTS warhead_type_id UUID NULL,
      ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS comment TEXT NULL,
      ADD COLUMN IF NOT EXISTS created_by_id UUID NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE drone_stock_movements
      ALTER COLUMN quantity TYPE NUMERIC(18, 3) USING quantity::numeric;
    `);
  }

  private async withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
    const attempts = 3;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === attempts || !this.isRetryableDatabaseError(error)) {
          throw error;
        }

        await this.delay(75 * attempt);
      }
    }

    return operation();
  }

  private isRetryableDatabaseError(error: unknown): boolean {
    const code = (error as { code?: string; driverError?: { code?: string } })?.code
      ?? (error as { driverError?: { code?: string } })?.driverError?.code;

    return code === '40P01' || code === '40001';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async findOrCreateDepotDroneStock(depotId: string, droneModelId: string) {
    return (
      (await this.depotDroneStock.findOne({ where: { depotId, droneModelId } })) ||
      this.depotDroneStock.create({ depotId, droneModelId, quantity: 0 })
    );
  }

  private async findOrCreateDepotWarheadStock(depotId: string, warheadTypeId: string) {
    return (
      (await this.depotWarheadStock.findOne({ where: { depotId, warheadTypeId } })) ||
      this.depotWarheadStock.create({ depotId, warheadTypeId, quantity: 0 })
    );
  }

  private async findOrCreateAirAssetDroneStock(airAssetPositionId: string, droneModelId: string) {
    return (
      (await this.airAssetDroneStock.findOne({ where: { airAssetPositionId, droneModelId } })) ||
      this.airAssetDroneStock.create({ airAssetPositionId, droneModelId, quantity: 0 })
    );
  }

  private async findOrCreateAirAssetWarheadStock(airAssetPositionId: string, warheadTypeId: string) {
    return (
      (await this.airAssetWarheadStock.findOne({ where: { airAssetPositionId, warheadTypeId } })) ||
      this.airAssetWarheadStock.create({ airAssetPositionId, warheadTypeId, quantity: 0 })
    );
  }

  private async findDepotDroneStockOrFail(depotId: string, droneModelId: string) {
    const stock = await this.depotDroneStock.findOne({ where: { depotId, droneModelId } });

    if (!stock) {
      throw new NotFoundException('Дрони на складі не знайдені');
    }

    return stock;
  }

  private async findDepotWarheadStockOrFail(depotId: string, warheadTypeId: string) {
    const stock = await this.depotWarheadStock.findOne({ where: { depotId, warheadTypeId } });

    if (!stock) {
      throw new NotFoundException('Бойові частини на складі не знайдені');
    }

    return stock;
  }
}
