import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { AirReconAreasService } from './air-recon-areas.service';
import { UpsertAirReconAreaDto } from './dto/upsert-air-recon-area.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class AirReconAreasController {
  constructor(private readonly service: AirReconAreasService) {}

  @Get('air-recon-areas')
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user);
  }

  @Get('air-recon-areas/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(id, user);
  }

  @Get('air-assets/:airAssetId/recon-areas')
  findByAsset(@CurrentUser() user: AuthUser, @Param('airAssetId') airAssetId: string) {
    return this.service.findByAsset(airAssetId, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('air-assets/:airAssetId/recon-areas')
  create(
    @CurrentUser() user: AuthUser,
    @Param('airAssetId') airAssetId: string,
    @Body() body: UpsertAirReconAreaDto,
  ) {
    return this.service.create(airAssetId, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Patch('air-recon-areas/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpsertAirReconAreaDto) {
    return this.service.update(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Delete('air-recon-areas/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(id, user);
  }
}
