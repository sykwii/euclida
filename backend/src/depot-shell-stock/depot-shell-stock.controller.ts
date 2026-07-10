import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateDepotShellStockDto } from './dto/create-depot-shell-stock.dto';
import { DepotShellStock } from './depot-shell-stock.entity';
import { DepotShellStockService } from './depot-shell-stock.service';

@UseGuards(JwtAuthGuard, MainScopeGuard)
@Controller('depot-shell-stock')
export class DepotShellStockController {
  constructor(private readonly service: DepotShellStockService) {}

  @Get()
  findAll(): Promise<DepotShellStock[]> {
    return this.service.findAll();
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(@Body() body: CreateDepotShellStockDto): Promise<DepotShellStock> {
    return this.service.create(body);
  }
}
