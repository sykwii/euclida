import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { AirAssetsService } from './air-assets.service';
import { CreateAirAssetPositionDto } from './dto/create-air-asset-position.dto';
import { UpdateAirAssetPositionDto } from './dto/update-air-asset-position.dto';

@UseGuards(JwtAuthGuard)
@Controller('air-assets')
export class AirAssetsController {
  constructor(private readonly service: AirAssetsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(id, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAirAssetPositionDto) {
    return this.service.create(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateAirAssetPositionDto) {
    return this.service.update(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(id, user);
  }
}
