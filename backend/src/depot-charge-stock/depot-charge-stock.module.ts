import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotChargeStock } from './depot-charge-stock.entity';
import { DepotChargeStockController } from './depot-charge-stock.controller';
import { DepotChargeStockService } from './depot-charge-stock.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([DepotChargeStock])],
  controllers: [DepotChargeStockController],
  providers: [DepotChargeStockService],
})
export class DepotChargeStockModule {}