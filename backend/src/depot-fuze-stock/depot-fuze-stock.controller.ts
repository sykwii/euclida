import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateDepotFuzeStockDto } from './dto/create-depot-fuze-stock.dto';
import { DepotFuzeStock } from './depot-fuze-stock.entity';
import { DepotFuzeStockService } from './depot-fuze-stock.service';

@Controller('depot-fuze-stock')
export class DepotFuzeStockController {
  constructor(private readonly service: DepotFuzeStockService) {}

  @Get()
  findAll(): Promise<DepotFuzeStock[]> {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: CreateDepotFuzeStockDto): Promise<DepotFuzeStock> {
    return this.service.create(body);
  }
}
