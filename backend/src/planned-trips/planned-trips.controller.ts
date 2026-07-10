import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.types';
import { PlannedTripsService } from './planned-trips.service';

@Controller()
export class PlannedTripsController {
  constructor(private readonly service: PlannedTripsService) {}

  @Get('planned-routes')
  findRoutes() {
    return this.service.findRoutes();
  }

  @Post('planned-routes')
  createRoute(@Body() body: any) {
    return this.service.createRoute(body);
  }

  @Patch('planned-routes/:id')
  updateRoute(@Param('id') id: string, @Body() body: any) {
    return this.service.updateRoute(id, body);
  }

  @Delete('planned-routes/:id')
  deleteRoute(@Param('id') id: string) {
    return this.service.deleteRoute(id);
  }

  @Get('planned-trips')
  findTrips(@CurrentUser() user: AuthUser) {
    return this.service.findTrips(user);
  }

  @Post('planned-trips')
  createTrip(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.service.createTrip(body, user);
  }

  @Patch('planned-trips/:id')
  updateTrip(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.service.updateTrip(id, body, user);
  }

  @Post('planned-trips/:tripId/checkpoints/:checkpointId/pass')
  passCheckpoint(
    @Param('tripId') tripId: string,
    @Param('checkpointId') checkpointId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.markCheckpointPassed(tripId, checkpointId, user);
  }

  @Post('planned-trips/:id/return')
  createReturnTrip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.createReturnTrip(id, user);
  }

  @Get('planned-trips-analytics')
  analytics(@CurrentUser() user: AuthUser) {
    return this.service.analytics(user);
  }
}
