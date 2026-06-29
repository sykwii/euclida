import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateDepotPrimerStockDto } from './dto/create-depot-primer-stock.dto';
import { DepotPrimerStock } from './depot-primer-stock.entity';
import { DepotPrimerStockService } from './depot-primer-stock.service';

@Controller('depot-primer-stock')
export class DepotPrimerStockController {
  constructor(private readonly service: DepotPrimerStockService) {}

  @Get()
  findAll(): Promise<DepotPrimerStock[]> {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: CreateDepotPrimerStockDto): Promise<DepotPrimerStock> {
    return this.service.create(body);
  }
}