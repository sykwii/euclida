import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompleteFireMissionDto } from './dto/complete-fire-mission.dto';
import { CreateFireMissionDto } from './dto/create-fire-mission.dto';
import { UpdateFireMissionStatusDto } from './dto/update-fire-mission-status.dto';
import { FireMission } from './fire-mission.entity';
import { FireMissionsService } from './fire-missions.service';

@Controller('fire-missions')
@UseGuards(JwtAuthGuard)
export class FireMissionsController {
  constructor(private readonly service: FireMissionsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<FireMission[]> {
    return this.service.findAllForUser(user);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<FireMission> {
    return this.service.findOneForUser(id, user);
  }

  @Post()
  create(
    @Body() body: CreateFireMissionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<FireMission> {
    return this.service.create(body, user);
  }

  @Get(':id/completion-availability')
  getCompletionAvailability(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getCompletionAvailability(id, user);
  }

  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body() body: CompleteFireMissionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<FireMission> {
    return this.service.complete(id, body, user);
  }

  @Post(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateFireMissionStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<FireMission> {
    return this.service.updateStatus(id, body, user);
  }
}
