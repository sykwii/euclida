import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { Depot } from '../depots/depot.entity';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Depot,
      DepotShellStock,
      DepotChargeStock,
      DepotFuzeStock,
      DepotPrimerStock,
    ]),
    AccessScopeModule,
  ],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
