import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import {
  CreatePlannedTripDto,
  PlannedRouteDto,
  UpdatePlannedTripDto,
} from './dto/planned-trips.dto';
import { PlannedTripsService } from './planned-trips.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class PlannedTripsController {
  constructor(private readonly service: PlannedTripsService) {}

  @Get('planned-routes')
  findRoutes() {
    return this.service.findRoutes();
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post('planned-routes')
  createRoute(@Body() body: PlannedRouteDto) {
    return this.service.createRoute(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch('planned-routes/:id')
  updateRoute(@Param('id') id: string, @Body() body: PlannedRouteDto) {
    return this.service.updateRoute(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete('planned-routes/:id')
  deleteRoute(@Param('id') id: string) {
    return this.service.deleteRoute(id);
  }

  @Get('planned-trips')
  findTrips(@CurrentUser() user: AuthUser) {
    return this.service.findTrips(user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('planned-trips')
  createTrip(@CurrentUser() user: AuthUser, @Body() body: CreatePlannedTripDto) {
    return this.service.createTrip(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Patch('planned-trips/:id')
  updateTrip(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdatePlannedTripDto) {
    return this.service.updateTrip(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('planned-trips/:tripId/checkpoints/:checkpointId/pass')
  passCheckpoint(
    @Param('tripId') tripId: string,
    @Param('checkpointId') checkpointId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.markCheckpointPassed(tripId, checkpointId, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('planned-trips/:id/return')
  createReturnTrip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.createReturnTrip(id, user);
  }

  @Get('planned-trips-analytics')
  analytics(@CurrentUser() user: AuthUser) {
    return this.service.analytics(user);
  }
}
