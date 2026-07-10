import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { MarkReadEventLogsDto } from './dto/mark-read-event-logs.dto';
import { EventLog } from './event-log.entity';
import { EventLogFilters, EventLogsService } from './event-logs.service';

@UseGuards(JwtAuthGuard)
@Controller('event-logs')
export class EventLogsController {
  constructor(private readonly service: EventLogsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('eventType') eventType?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<EventLog[]> {
    const filters: EventLogFilters = {
      eventType: eventType || undefined,
      action: action || undefined,
      entityType: entityType || undefined,
      q: q || undefined,
      limit: limit ? Number(limit) : undefined,
    };

    return this.service.findAll(user, filters);
  }

  @UseGuards(WriteAccessGuard)
  @Post('mark-read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Body() body: MarkReadEventLogsDto = {},
  ): Promise<{ updated: number }> {
    return this.service.markRead(user, body.ids);
  }
}
