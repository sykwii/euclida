import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StockService } from './stock.service';

@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get('by-depots')
  getByDepots(@CurrentUser() user: AuthUser) {
    return this.service.getByDepots(user);
  }
}
