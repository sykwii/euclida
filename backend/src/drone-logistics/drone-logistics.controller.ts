import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { DroneLogisticsService } from './drone-logistics.service';
import {
  AddDroneStockDto,
  AddWarheadStockDto,
  CorrectAirAssetDroneStockDto,
  CorrectAirAssetWarheadStockDto,
  CreateDroneModelDto,
  CreateDroneWarheadTypeDto,
  TransferDroneToAirAssetDto,
  TransferWarheadToAirAssetDto,
} from './dto/drone-logistics.dto';

@UseGuards(JwtAuthGuard, MainScopeGuard)
@Controller('drone-logistics')
export class DroneLogisticsController {
  constructor(private readonly service: DroneLogisticsService) {}

  @Get('models')
  getDroneModels() {
    return this.service.getDroneModels();
  }

  @UseGuards(WriteAccessGuard)
  @Post('models')
  createDroneModel(@Body() body: CreateDroneModelDto) {
    return this.service.createDroneModel(body);
  }

  @Get('warhead-types')
  getWarheadTypes() {
    return this.service.getWarheadTypes();
  }

  @UseGuards(WriteAccessGuard)
  @Post('warhead-types')
  createWarheadType(@Body() body: CreateDroneWarheadTypeDto) {
    return this.service.createWarheadType(body);
  }

  @Get('depot-drone-stock')
  getDepotDroneStock(@Query('depotId') depotId?: string) {
    return this.service.getDepotDroneStock(depotId);
  }

  @Get('depot-warhead-stock')
  getDepotWarheadStock(@Query('depotId') depotId?: string) {
    return this.service.getDepotWarheadStock(depotId);
  }

  @Get('air-asset-drone-stock')
  getAirAssetDroneStock(@Query('airAssetPositionId') airAssetPositionId?: string) {
    return this.service.getAirAssetDroneStock(airAssetPositionId);
  }

  @Get('air-assets/:airAssetId/drone-stock')
  getAirAssetDroneStockByRoute(@Param('airAssetId') airAssetId: string) {
    return this.service.getAirAssetDroneStock(airAssetId);
  }

  @Get('air-asset-warhead-stock')
  getAirAssetWarheadStock(@Query('airAssetPositionId') airAssetPositionId?: string) {
    return this.service.getAirAssetWarheadStock(airAssetPositionId);
  }

  @Get('air-assets/:airAssetId/warhead-stock')
  getAirAssetWarheadStockByRoute(@Param('airAssetId') airAssetId: string) {
    return this.service.getAirAssetWarheadStock(airAssetId);
  }

  @Get('movements')
  getMovements() {
    return this.service.getMovements();
  }

  @UseGuards(WriteAccessGuard)
  @Post('depot-drone-stock/add')
  addDroneToDepot(
    @Body() body: AddDroneStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addDroneToDepot(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('depot-warhead-stock/add')
  addWarheadToDepot(
    @Body() body: AddWarheadStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addWarheadToDepot(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('transfer-drone-to-air-asset')
  transferDroneToAirAsset(
    @Body() body: TransferDroneToAirAssetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.transferDroneToAirAsset(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('transfer-warhead-to-air-asset')
  transferWarheadToAirAsset(
    @Body() body: TransferWarheadToAirAssetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.transferWarheadToAirAsset(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('air-assets/:airAssetId/drone-stock/correction')
  correctAirAssetDroneStock(
    @Param('airAssetId') airAssetId: string,
    @Body() body: CorrectAirAssetDroneStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.correctAirAssetDroneStock(airAssetId, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('air-assets/:airAssetId/warhead-stock/correction')
  correctAirAssetWarheadStock(
    @Param('airAssetId') airAssetId: string,
    @Body() body: CorrectAirAssetWarheadStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.correctAirAssetWarheadStock(airAssetId, body, user);
  }
}
