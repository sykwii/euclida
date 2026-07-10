import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AirAssetPosition } from './air-asset-position.entity';
import { AirAssetsController } from './air-assets.controller';
import { AirAssetsService } from './air-assets.service';
import { AirAssetTasksController } from './air-asset-tasks.controller';
import { AirAssetTasksService } from './air-asset-tasks.service';
import { AirAssetTask } from './air-asset-task.entity';
import { AirAssetTaskPoint } from './air-asset-task-point.entity';
import { AirReconAreasController } from './air-recon-areas.controller';
import { AirReconAreasService } from './air-recon-areas.service';
import { AirReconAreaPoint } from './air-recon-area-point.entity';
import { AirReconArea } from './air-recon-area.entity';
import { AuthModule } from '../auth/auth.module';
import { EventLogsModule } from '../event-logs/event-logs.module';
import { AirAssetDroneStock } from '../drone-logistics/air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from '../drone-logistics/air-asset-warhead-stock.entity';
import { DroneModel } from '../drone-logistics/drone-model.entity';
import { DroneWarheadType } from '../drone-logistics/drone-warhead-type.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      AirAssetPosition,
      AirReconArea,
      AirReconAreaPoint,
      AirAssetTask,
      AirAssetTaskPoint,
      AirAssetDroneStock,
      AirAssetWarheadStock,
      DroneModel,
      DroneWarheadType,
    ]),
    AccessScopeModule,
    RealtimeModule,
    EventLogsModule,
  ],
  controllers: [AirAssetsController, AirReconAreasController, AirAssetTasksController],
  providers: [AirAssetsService, AirReconAreasService, AirAssetTasksService],
  exports: [AirAssetsService, AirReconAreasService, AirAssetTasksService],
})
export class AirAssetsModule {}
