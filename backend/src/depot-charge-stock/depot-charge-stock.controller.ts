import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateDepotChargeStockDto } from './dto/create-depot-charge-stock.dto';
import { DepotChargeStock } from './depot-charge-stock.entity';
import { DepotChargeStockService } from './depot-charge-stock.service';

@UseGuards(JwtAuthGuard, MainScopeGuard)
@Controller('depot-charge-stock')
export class DepotChargeStockController {
  constructor(private readonly service: DepotChargeStockService) {}

  @Get()
  findAll(): Promise<DepotChargeStock[]> {
    return this.service.findAll();
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(@Body() body: CreateDepotChargeStockDto): Promise<DepotChargeStock> {
    return this.service.create(body);
  }
}
