import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.types';
import { CreateStockMovementBatchDto } from './dto/create-stock-movement-batch.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovement } from './stock-movement.entity';
import { StockMovementsService } from './stock-movements.service';

@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly service: StockMovementsService) {}

@Get('grouped')
findGrouped(@CurrentUser() user: AuthUser) {
  return this.service.findGrouped(user);
}

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<StockMovement[]> {
    return this.service.findAll(user);
  }

  @Post('batch')
  createBatch(
    @Body() body: CreateStockMovementBatchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StockMovement[]> {
    return this.service.createBatch(body, user);
  }

  @Post()
  create(
    @Body() body: CreateStockMovementDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StockMovement> {
    return this.service.create(body, user);
  }
}
