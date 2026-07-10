import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotShellStock } from './depot-shell-stock.entity';
import { DepotShellStockController } from './depot-shell-stock.controller';
import { DepotShellStockService } from './depot-shell-stock.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { Depot } from '../depots/depot.entity';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([DepotShellStock, Depot])],
  controllers: [DepotShellStockController],
  providers: [DepotShellStockService],
})
export class DepotShellStockModule {}
