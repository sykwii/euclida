import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { StockMovement } from '../stock-movements/stock-movement.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { Unit } from '../units/unit.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { FireMission } from './fire-mission.entity';
import { FireMissionsController } from './fire-missions.controller';
import { FireMissionsService } from './fire-missions.service';

@Module({
  imports: [
    AuthModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      FireMission,
      FirePosition,
      WeaponSystem,
      Unit,
      StockMovement,
      DepotShellStock,
      DepotChargeStock,
      DepotPrimerStock,
      DepotFuzeStock,
    ]),
  ],
  controllers: [FireMissionsController],
  providers: [FireMissionsService],
})
export class FireMissionsModule {}
