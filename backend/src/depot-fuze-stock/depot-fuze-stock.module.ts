import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotFuzeStock } from './depot-fuze-stock.entity';
import { DepotFuzeStockController } from './depot-fuze-stock.controller';
import { DepotFuzeStockService } from './depot-fuze-stock.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([DepotFuzeStock])],
  controllers: [DepotFuzeStockController],
  providers: [DepotFuzeStockService],
})
export class DepotFuzeStockModule {}
