import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateDepotFuzeStockDto } from './dto/create-depot-fuze-stock.dto';
import { DepotFuzeStock } from './depot-fuze-stock.entity';
import { DepotFuzeStockService } from './depot-fuze-stock.service';

@UseGuards(JwtAuthGuard, MainScopeGuard)
@Controller('depot-fuze-stock')
export class DepotFuzeStockController {
  constructor(private readonly service: DepotFuzeStockService) {}

  @Get()
  findAll(): Promise<DepotFuzeStock[]> {
    return this.service.findAll();
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(@Body() body: CreateDepotFuzeStockDto): Promise<DepotFuzeStock> {
    return this.service.create(body);
  }
}
