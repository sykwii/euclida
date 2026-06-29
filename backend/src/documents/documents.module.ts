import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ServiceOrder, WeaponSystem, FirePosition, DepotShellStock])],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
