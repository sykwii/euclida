import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { StockMovement } from './stock-movement.entity';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';
import { Depot } from 'src/depots/depot.entity';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockMovement,
      Depot,
      DepotShellStock,
      DepotChargeStock,
      DepotFuzeStock,
      DepotPrimerStock,
    ]),
    AccessScopeModule,
    RealtimeModule,
  ],
  controllers: [StockMovementsController],
  providers: [StockMovementsService],
})
export class StockMovementsModule {}
