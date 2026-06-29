import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
}