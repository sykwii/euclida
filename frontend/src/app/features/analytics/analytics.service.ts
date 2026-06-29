import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import {
  AmmoRecipientAnalyticsRow,
  AnalyticsDashboard,
  LogisticsFlowRow,
  ShootingAnalytics,
  OperationalAnalyticsV2,
} from './analytics.model';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  constructor(private readonly api: ApiService) {}

  getOperationalAnalytics(days = 7) {
    return this.api.get<OperationalAnalyticsV2>(`/analytics/operational?days=${days}`);
  }

  getDashboard() {
    return this.api.get<AnalyticsDashboard>('/analytics/dashboard');
  }

  getOperatorCounters() {
    return this.api.get<{
      actionOrdersCount: number;
      activeThreatsCount: number;
    }>('/analytics/operator-counters');
  }

  getLogisticsFlow(days = 7) {
    return this.api.get<LogisticsFlowRow[]>(`/analytics/logistics-flow?days=${days}`);
  }

  getAmmoRecipients(days = 7) {
    return this.api.get<AmmoRecipientAnalyticsRow[]>(`/analytics/ammo-recipients?days=${days}`);
  }

  getShootingAnalytics(days = 7) {
    return this.api.get<ShootingAnalytics>(`/analytics/shooting?days=${days}`);
  }
}
