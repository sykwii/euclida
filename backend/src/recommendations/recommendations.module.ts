import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([WeaponSystem, FirePosition, ServiceOrder, DepotShellStock])],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
