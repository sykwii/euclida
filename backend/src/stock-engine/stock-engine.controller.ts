import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateStockOperationDto } from './dto/create-stock-operation.dto';
import { StockEngineService } from './stock-engine.service';
import type { StockResourceType } from './stock-resource.types';

@UseGuards(JwtAuthGuard)
@Controller('stock-engine')
export class StockEngineController {
  constructor(private readonly service: StockEngineService) {}
  @Get('depots/:depotId/balances') balances(@Param('depotId') depotId: string, @CurrentUser() user: AuthUser) { return this.service.listDepotBalances(depotId, user); }
  @Get('depots/:depotId/history') history(@Param('depotId') depotId: string, @Query('resourceType') resourceType: StockResourceType, @Query('resourceId') resourceId: string, @CurrentUser() user: AuthUser) { return this.service.history(depotId, resourceType, resourceId, user); }
  @Post('operations') execute(@Body() body: CreateStockOperationDto, @CurrentUser() user: AuthUser) { return this.service.execute(body, user); }
}
