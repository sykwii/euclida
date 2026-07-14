import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OperationalNotificationsService } from './operational-notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('operational-notifications')
export class OperationalNotificationsController {
  constructor(private readonly service: OperationalNotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.service.findAll(user, unread === 'true');
  }

  @Get('count')
  count(@CurrentUser() user: AuthUser) {
    return this.service.countUnread(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOneForUser(id, user);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markRead(id, user);
  }

  @Post(':id/acknowledge')
  acknowledge(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.acknowledge(id, user);
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user);
  }
}
