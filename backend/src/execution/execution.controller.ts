import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateExecutionRecordDto } from './dto/create-execution-record.dto';
import { ExecutionRecord } from './execution-record.entity';
import { ExecutionService } from './execution.service';

@UseGuards(JwtAuthGuard)
@Controller('execution')
export class ExecutionController {
  constructor(private readonly service: ExecutionService) {}

  @Get('service-orders/:serviceOrderId')
  findByServiceOrder(
    @CurrentUser() user: AuthUser,
    @Param('serviceOrderId') serviceOrderId: string,
  ): Promise<ExecutionRecord[]> {
    return this.service.findByServiceOrder(serviceOrderId, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('service-orders/:serviceOrderId/records')
  create(
    @CurrentUser() user: AuthUser,
    @Param('serviceOrderId') serviceOrderId: string,
    @Body() body: CreateExecutionRecordDto,
  ): Promise<ExecutionRecord> {
    return this.service.create(serviceOrderId, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('records/:id/post')
  post(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ExecutionRecord> {
    return this.service.post(id, user);
  }
}
