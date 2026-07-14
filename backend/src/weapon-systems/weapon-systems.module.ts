import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { WeaponSystem } from './weapon-system.entity';
import { WeaponDeployment } from './weapon-deployment.entity';
import { WeaponMaintenance } from './weapon-maintenance.entity';
import { WeaponSystemsController } from './weapon-systems.controller';
import { WeaponSystemsService } from './weapon-systems.service';
import { AuthModule } from '../auth/auth.module';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EventLogsModule } from '../event-logs/event-logs.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([
      WeaponSystem,
      WeaponMaintenance,
      WeaponDeployment,
      FirePosition,
      ServiceOrder,
    ]),
    AuthModule,
    AccessScopeModule,
    RealtimeModule,
    EventLogsModule,
  ],
  controllers: [WeaponSystemsController],
  providers: [WeaponSystemsService],
})
export class WeaponSystemsModule {}
