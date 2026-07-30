import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Depot } from '../depots/depot.entity';
import { Unit } from './unit.entity';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { AccessScopeModule } from '../access-scope/access-scope.module';

@Module({
  imports: [
    RealtimeModule,
    AccessScopeModule,
    TypeOrmModule.forFeature([Unit, Depot]),
    AuthModule,
  ],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
