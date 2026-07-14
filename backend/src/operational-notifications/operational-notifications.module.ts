import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { ServiceOrderDelivery } from '../service-orders/service-order-delivery.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { OperationalNotification } from './operational-notification.entity';
import { OperationalNotificationsController } from './operational-notifications.controller';
import { OperationalNotificationsService } from './operational-notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OperationalNotification,
      ServiceOrderDelivery,
      ServiceOrder,
      WeaponSystem,
      FirePosition,
    ]),
    AuthModule,
    AccessScopeModule,
    RealtimeModule,
  ],
  controllers: [OperationalNotificationsController],
  providers: [OperationalNotificationsService],
  exports: [OperationalNotificationsService],
})
export class OperationalNotificationsModule {}
