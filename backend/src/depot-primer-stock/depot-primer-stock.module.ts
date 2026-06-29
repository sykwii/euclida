import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotPrimerStockController } from './depot-primer-stock.controller';
import { DepotPrimerStock } from './depot-primer-stock.entity';
import { DepotPrimerStockService } from './depot-primer-stock.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([DepotPrimerStock])],
  controllers: [DepotPrimerStockController],
  providers: [DepotPrimerStockService],
})
export class DepotPrimerStockModule {}