import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateDepotChargeStockDto } from './dto/create-depot-charge-stock.dto';
import { DepotChargeStock } from './depot-charge-stock.entity';
import { DepotChargeStockService } from './depot-charge-stock.service';

@Controller('depot-charge-stock')
export class DepotChargeStockController {
  constructor(private readonly service: DepotChargeStockService) {}

  @Get()
  findAll(): Promise<DepotChargeStock[]> {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: CreateDepotChargeStockDto): Promise<DepotChargeStock> {
    return this.service.create(body);
  }
}