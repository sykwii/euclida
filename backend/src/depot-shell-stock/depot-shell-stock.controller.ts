import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateDepotShellStockDto } from './dto/create-depot-shell-stock.dto';
import { DepotShellStock } from './depot-shell-stock.entity';
import { DepotShellStockService } from './depot-shell-stock.service';

@Controller('depot-shell-stock')
export class DepotShellStockController {
  constructor(private readonly service: DepotShellStockService) {}

  @Get()
  findAll(): Promise<DepotShellStock[]> {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: CreateDepotShellStockDto): Promise<DepotShellStock> {
    return this.service.create(body);
  }
}
