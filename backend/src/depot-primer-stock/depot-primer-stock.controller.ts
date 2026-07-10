import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateDepotPrimerStockDto } from './dto/create-depot-primer-stock.dto';
import { DepotPrimerStock } from './depot-primer-stock.entity';
import { DepotPrimerStockService } from './depot-primer-stock.service';

@UseGuards(JwtAuthGuard, MainScopeGuard)
@Controller('depot-primer-stock')
export class DepotPrimerStockController {
  constructor(private readonly service: DepotPrimerStockService) {}

  @Get()
  findAll(): Promise<DepotPrimerStock[]> {
    return this.service.findAll();
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(@Body() body: CreateDepotPrimerStockDto): Promise<DepotPrimerStock> {
    return this.service.create(body);
  }
}
