import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockEngineModule } from '../stock-engine/stock-engine.module';
import { AirAssetDroneStock } from './air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from './air-asset-warhead-stock.entity';
import { DepotDroneStock } from './depot-drone-stock.entity';
import { DepotDroneWarheadStock } from './depot-drone-warhead-stock.entity';
import { DroneCatalogService } from './drone-catalog.service';
import { DroneLogisticsController } from './drone-logistics.controller';
import { DroneInventoryService } from './drone-inventory.service';
import { DroneLogisticsSchemaService } from './drone-logistics-schema.service';
import { DroneLogisticsService } from './drone-logistics.service';
import { DroneModel } from './drone-model.entity';
import { DroneStockMovement } from './drone-stock-movement.entity';
import { DroneTransferService } from './drone-transfer.service';
import { DroneWarheadType } from './drone-warhead-type.entity';

@Module({
  imports: [
    StockEngineModule,
    TypeOrmModule.forFeature([
      DroneModel,
      DroneWarheadType,
      DepotDroneStock,
      DepotDroneWarheadStock,
      AirAssetDroneStock,
      AirAssetWarheadStock,
      DroneStockMovement,
    ]),
  ],
  controllers: [DroneLogisticsController],
  providers: [
    DroneLogisticsSchemaService,
    DroneCatalogService,
    DroneInventoryService,
    DroneTransferService,
    DroneLogisticsService,
  ],
})
export class DroneLogisticsModule {}
