import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PlannedRoutePoint } from './planned-route-point.entity';
import { PlannedRoute } from './planned-route.entity';
import { PlannedTripsController } from './planned-trips.controller';
import { PlannedTripsService } from './planned-trips.service';
import { PlannedVehicleTripCheckpoint } from './planned-vehicle-trip-checkpoint.entity';
import { PlannedVehicleTrip } from './planned-vehicle-trip.entity';

@Module({
  imports: [
    AccessScopeModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      PlannedRoute,
      PlannedRoutePoint,
      PlannedVehicleTrip,
      PlannedVehicleTripCheckpoint,
    ]),
  ],
  controllers: [PlannedTripsController],
  providers: [PlannedTripsService],
})
export class PlannedTripsModule {}
