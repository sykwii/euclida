import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotShellStock } from './depot-shell-stock.entity';
import { DepotShellStockController } from './depot-shell-stock.controller';
import { DepotShellStockService } from './depot-shell-stock.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([DepotShellStock])],
  controllers: [DepotShellStockController],
  providers: [DepotShellStockService],
})
export class DepotShellStockModule {}
