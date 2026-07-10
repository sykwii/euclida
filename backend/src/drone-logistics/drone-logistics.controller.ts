import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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

@Controller('drone-logistics')
export class DroneLogisticsController {
  constructor(private readonly service: DroneLogisticsService) {}

  @Get('models')
  getDroneModels() {
    return this.service.getDroneModels();
  }

  @Post('models')
  createDroneModel(@Body() body: CreateDroneModelDto) {
    return this.service.createDroneModel(body);
  }

  @Get('warhead-types')
  getWarheadTypes() {
    return this.service.getWarheadTypes();
  }

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

  @Post('depot-drone-stock/add')
  addDroneToDepot(@Body() body: AddDroneStockDto) {
    return this.service.addDroneToDepot(body);
  }

  @Post('depot-warhead-stock/add')
  addWarheadToDepot(@Body() body: AddWarheadStockDto) {
    return this.service.addWarheadToDepot(body);
  }

  @Post('transfer-drone-to-air-asset')
  transferDroneToAirAsset(@Body() body: TransferDroneToAirAssetDto) {
    return this.service.transferDroneToAirAsset(body);
  }

  @Post('transfer-warhead-to-air-asset')
  transferWarheadToAirAsset(@Body() body: TransferWarheadToAirAssetDto) {
    return this.service.transferWarheadToAirAsset(body);
  }

  @Post('air-assets/:airAssetId/drone-stock/correction')
  correctAirAssetDroneStock(
    @Param('airAssetId') airAssetId: string,
    @Body() body: CorrectAirAssetDroneStockDto,
  ) {
    return this.service.correctAirAssetDroneStock(airAssetId, body);
  }

  @Post('air-assets/:airAssetId/warhead-stock/correction')
  correctAirAssetWarheadStock(
    @Param('airAssetId') airAssetId: string,
    @Body() body: CorrectAirAssetWarheadStockDto,
  ) {
    return this.service.correctAirAssetWarheadStock(airAssetId, body);
  }
}
