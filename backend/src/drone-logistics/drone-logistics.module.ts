import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../realtime/realtime.module';
import { DroneModel } from './drone-model.entity';
import { DroneWarheadType } from './drone-warhead-type.entity';
import { DepotDroneStock } from './depot-drone-stock.entity';
import { DepotDroneWarheadStock } from './depot-drone-warhead-stock.entity';
import { AirAssetDroneStock } from './air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from './air-asset-warhead-stock.entity';
import { DroneStockMovement } from './drone-stock-movement.entity';
import { DroneLogisticsController } from './drone-logistics.controller';
import { DroneLogisticsService } from './drone-logistics.service';

@Module({
  imports: [
    RealtimeModule,
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
  providers: [DroneLogisticsService],
})
export class DroneLogisticsModule {}
