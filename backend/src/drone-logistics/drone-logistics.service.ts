import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
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
import { DroneCatalogService } from './drone-catalog.service';
import { DroneInventoryService } from './drone-inventory.service';
import { DroneLogisticsSchemaService } from './drone-logistics-schema.service';
import { DroneTransferService } from './drone-transfer.service';

@Injectable()
export class DroneLogisticsService {
  constructor(
    private readonly schema: DroneLogisticsSchemaService,
    private readonly catalog: DroneCatalogService,
    private readonly inventory: DroneInventoryService,
    private readonly transfer: DroneTransferService,
  ) {
    void this.schema.ensureDroneLogisticsSchema().catch(() => undefined);
  }

  getDroneModels() {
    return this.catalog.getDroneModels();
  }

  createDroneModel(data: CreateDroneModelDto) {
    return this.catalog.createDroneModel(data);
  }

  getWarheadTypes() {
    return this.catalog.getWarheadTypes();
  }

  createWarheadType(data: CreateDroneWarheadTypeDto) {
    return this.catalog.createWarheadType(data);
  }

  getDepotDroneStock(depotId?: string) {
    return this.inventory.getDepotDroneStock(depotId);
  }

  getDepotWarheadStock(depotId?: string) {
    return this.inventory.getDepotWarheadStock(depotId);
  }

  getAirAssetDroneStock(airAssetPositionId?: string) {
    return this.inventory.getAirAssetDroneStock(airAssetPositionId);
  }

  getAirAssetWarheadStock(airAssetPositionId?: string) {
    return this.inventory.getAirAssetWarheadStock(airAssetPositionId);
  }

  getMovements() {
    return this.inventory.getMovements();
  }

  addDroneToDepot(data: AddDroneStockDto, user: AuthUser) {
    return this.transfer.addDroneToDepot(data, user);
  }

  addWarheadToDepot(data: AddWarheadStockDto, user: AuthUser) {
    return this.transfer.addWarheadToDepot(data, user);
  }

  transferDroneToAirAsset(data: TransferDroneToAirAssetDto, user: AuthUser) {
    return this.transfer.transferDroneToAirAsset(data, user);
  }

  transferWarheadToAirAsset(data: TransferWarheadToAirAssetDto, user: AuthUser) {
    return this.transfer.transferWarheadToAirAsset(data, user);
  }

  correctAirAssetDroneStock(
    airAssetPositionId: string,
    data: CorrectAirAssetDroneStockDto,
    user: AuthUser,
  ) {
    return this.transfer.correctAirAssetDroneStock(airAssetPositionId, data, user);
  }

  correctAirAssetWarheadStock(
    airAssetPositionId: string,
    data: CorrectAirAssetWarheadStockDto,
    user: AuthUser,
  ) {
    return this.transfer.correctAirAssetWarheadStock(airAssetPositionId, data, user);
  }
}
