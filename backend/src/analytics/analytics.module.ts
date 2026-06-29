import { Module } from '@nestjs/common';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { AirThreatsModule } from '../air-threats/air-threats.module';
import { AuthModule } from '../auth/auth.module';
import { ServiceOrdersModule } from '../service-orders/service-orders.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [AuthModule, ServiceOrdersModule, AirThreatsModule, AccessScopeModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
