import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import {
  AmmoRecipientAnalyticsRow,
  AnalyticsDashboard,
  LogisticsFlowRow,
  ShootingAnalytics,
  OperationalAnalyticsV2,
} from './analytics.types';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}


  @Get('operational')
  getOperationalAnalytics(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ): Promise<OperationalAnalyticsV2> {
    return this.analyticsService.getOperationalAnalytics(days, user);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthUser): Promise<AnalyticsDashboard> {
    return this.analyticsService.getDashboard(user);
  }

  @Get('operator-counters')
  getOperatorCounters(
    @CurrentUser() user: AuthUser,
  ): Promise<{ actionOrdersCount: number; activeThreatsCount: number }> {
    return this.analyticsService.getOperatorCounters(user);
  }

  @Get('logistics-flow')
  getLogisticsFlow(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ): Promise<LogisticsFlowRow[]> {
    return this.analyticsService.getLogisticsFlow(days, user);
  }

  @Get('ammo-recipients')
  getAmmoRecipients(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ): Promise<AmmoRecipientAnalyticsRow[]> {
    return this.analyticsService.getAmmoRecipients(days, user);
  }

  @Get('shooting')
  getShootingAnalytics(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ): Promise<ShootingAnalytics> {
    return this.analyticsService.getShootingAnalytics(days, user);
  }
}
