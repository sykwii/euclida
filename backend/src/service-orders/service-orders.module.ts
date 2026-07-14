import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionRecordArtillery } from '../execution/execution-record-artillery.entity';
import { ExecutionRecordCharge } from '../execution/execution-record-charge.entity';
import { ExecutionRecord } from '../execution/execution-record.entity';
import { ServiceOrderActualAmmo } from './service-order-actual-ammo.entity';
import { ServiceOrderActualShotConfigurationCharge } from './service-order-actual-shot-configuration-charge.entity';
import { ServiceOrderActualShotConfiguration } from './service-order-actual-shot-configuration.entity';
import { ServiceOrderDelivery } from './service-order-delivery.entity';
import { ServiceOrder } from './service-order.entity';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';
import { ServiceOrderSuggestionsService } from './service-order-suggestions.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { AuthModule } from '../auth/auth.module';
import { EventLogsModule } from '../event-logs/event-logs.module';
import { ReconModule } from '../modules/recon/recon.module';
import { ShotConfigurationsModule } from '../shot-configurations/shot-configurations.module';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceOrder, ServiceOrderDelivery, ServiceOrderActualAmmo, ServiceOrderActualShotConfiguration, ServiceOrderActualShotConfigurationCharge, ExecutionRecord, ExecutionRecordArtillery, ExecutionRecordCharge]),RealtimeModule,AccessScopeModule,AuthModule,EventLogsModule,ReconModule,ShotConfigurationsModule],
  controllers: [ServiceOrdersController],
  providers: [
  ServiceOrdersService,
  ServiceOrderSuggestionsService,
],
  exports: [ServiceOrdersService],
})



export class ServiceOrdersModule {}
