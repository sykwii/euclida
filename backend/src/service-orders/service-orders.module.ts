import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceOrderActualAmmo } from './service-order-actual-ammo.entity';
import { ServiceOrder } from './service-order.entity';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';
import { ServiceOrderSuggestionsService } from './service-order-suggestions.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { AuthModule } from '../auth/auth.module';
import { EventLogsModule } from 'src/event-logs/event-logs.module';
import { ReconModule } from '../modules/recon/recon.module';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceOrder, ServiceOrderActualAmmo]),RealtimeModule,AccessScopeModule,AuthModule,EventLogsModule,ReconModule],
  controllers: [ServiceOrdersController],
  providers: [
  ServiceOrdersService,
  ServiceOrderSuggestionsService,
],
  exports: [ServiceOrdersService],
})



export class ServiceOrdersModule {}
