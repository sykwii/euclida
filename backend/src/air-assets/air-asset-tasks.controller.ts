import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { AirAssetTasksService } from './air-asset-tasks.service';
import { UpsertAirAssetTaskDto } from './dto/upsert-air-asset-task.dto';

@UseGuards(JwtAuthGuard)
@Controller('air-asset-tasks')
export class AirAssetTasksController {
  constructor(private readonly service: AirAssetTasksService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user);
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: UpsertAirAssetTaskDto) {
    return this.service.create(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpsertAirAssetTaskDto) {
    return this.service.update(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(id, user);
  }
}
