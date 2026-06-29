import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EndOperatorShiftDto } from './dto/end-operator-shift.dto';
import { OperatorShift } from './operator-shift.entity';
import { OperatorShiftsService } from './operator-shifts.service';

@UseGuards(JwtAuthGuard)
@Controller('operator-shifts')
export class OperatorShiftsController {
  constructor(private readonly service: OperatorShiftsService) {}

  @Get('current')
  getCurrent(@CurrentUser() user: AuthUser): Promise<OperatorShift | null> {
    return this.service.findCurrent(user);
  }

  @Post('start')
  start(@CurrentUser() user: AuthUser): Promise<OperatorShift> {
    return this.service.start(user);
  }

  @Post('end')
  end(
    @CurrentUser() user: AuthUser,
    @Body() body: EndOperatorShiftDto,
  ): Promise<OperatorShift> {
    return this.service.end(user, body.note);
  }
}
