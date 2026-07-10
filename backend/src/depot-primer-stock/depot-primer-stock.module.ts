import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotPrimerStockController } from './depot-primer-stock.controller';
import { DepotPrimerStock } from './depot-primer-stock.entity';
import { DepotPrimerStockService } from './depot-primer-stock.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { Depot } from '../depots/depot.entity';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([DepotPrimerStock, Depot])],
  controllers: [DepotPrimerStockController],
  providers: [DepotPrimerStockService],
})
export class DepotPrimerStockModule {}
