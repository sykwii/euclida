import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { AirAssetPosition } from '../air-assets/air-asset-position.entity';
import { AirAssetDroneStock } from '../drone-logistics/air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from '../drone-logistics/air-asset-warhead-stock.entity';
import { Charge } from '../charges/charge.entity';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { Depot } from '../depots/depot.entity';
import { DepotDroneStock } from '../drone-logistics/depot-drone-stock.entity';
import { DepotDroneWarheadStock } from '../drone-logistics/depot-drone-warhead-stock.entity';
import { DroneStockMovement } from '../drone-logistics/drone-stock-movement.entity';
import { EventLogsModule } from '../event-logs/event-logs.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StockMovement } from '../stock-movements/stock-movement.entity';
import { AmmoStockAdapter } from './adapters/ammo-stock.adapter';
import { DroneLocationStockAdapter } from './adapters/drone-location-stock.adapter';
import { DroneStockAdapter } from './adapters/drone-stock.adapter';
import { DroneStockEngineService } from './drone-stock-engine.service';
import { StockEngineController } from './stock-engine.controller';
import { StockEngineService } from './stock-engine.service';
import { StockOperation } from './stock-operation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockOperation,
      StockMovement,
      DroneStockMovement,
      Depot,
      AirAssetPosition,
      Charge,
      DepotShellStock,
      DepotChargeStock,
      DepotFuzeStock,
      DepotPrimerStock,
      DepotDroneStock,
      DepotDroneWarheadStock,
      AirAssetDroneStock,
      AirAssetWarheadStock,
    ]),
    AccessScopeModule,
    RealtimeModule,
    EventLogsModule,
  ],
  controllers: [StockEngineController],
  providers: [
    StockEngineService,
    DroneStockEngineService,
    AmmoStockAdapter,
    DroneStockAdapter,
    DroneLocationStockAdapter,
  ],
  exports: [StockEngineService, DroneStockEngineService],
})
export class StockEngineModule {}
