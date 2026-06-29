import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { of, Subscription } from 'rxjs';
import { catchError, finalize, timeout } from 'rxjs/operators';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import {
  AnalyticsV2AmmoForecastRow,
  AnalyticsV2AttentionItem,
  AnalyticsV2DeliveryTopRow,
  AnalyticsV2FirePositionTaskRow,
  AnalyticsV2LowAmmoRow,
  AnalyticsV2ReadinessReasonRow,
  AnalyticsV2RotationRow,
  AnalyticsV2WeaponEfficiencyRow,
  OperationalAnalyticsV2,
} from '../analytics.model';
import { AnalyticsService } from '../analytics.service';

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analytics-page.html',
  styleUrl: './analytics-page.css',
})
export class AnalyticsPage implements OnInit, OnDestroy {
  data: OperationalAnalyticsV2 | null = null;
  periodDays = 7;
  loading = false;
  refreshing = false;
  error = '';
  lastUpdatedAt: Date | null = null;

  readonly skeletonItems = Array.from({ length: 8 }, (_, index) => index);

  private readonly subscriptions = new Subscription();
  private analyticsRequest?: Subscription;
  private requestId = 0;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.refresh(true);

    this.subscriptions.add(
      this.autoRefresh.watch(
        ['all', 'analytics', 'missions', 'stock', 'map', 'weapons', 'threats'],
        () => this.refresh(false),
      ),
    );
  }

  ngOnDestroy(): void {
    this.analyticsRequest?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  refresh(showLoader = true, force = false): void {
    if ((this.loading || this.refreshing) && !force) {
      return;
    }

    const requestId = ++this.requestId;
    const hasData = Boolean(this.data);
    this.error = '';

    if (showLoader && !hasData) {
      this.loading = true;
      this.refreshing = false;
    } else {
      this.refreshing = true;
      this.loading = false;
    }

    this.analyticsRequest?.unsubscribe();
    this.analyticsRequest = this.analytics
      .getOperationalAnalytics(this.periodDays)
      .pipe(
        timeout(12_000),
        catchError(() => {
          if (requestId !== this.requestId) return of(null);

          this.error = hasData
            ? 'Аналітику не вдалося оновити. Показані останні доступні дані.'
            : 'Не вдалося завантажити аналітику.';
          return of(null);
        }),
        finalize(() => {
          if (requestId !== this.requestId) return;

          this.loading = false;
          this.refreshing = false;
        }),
      )
      .subscribe((data) => {
        if (!data || requestId !== this.requestId) return;

        this.data = this.normalizeAnalytics(data);
        this.lastUpdatedAt = new Date();
      });
  }

  setPeriod(days: number): void {
    const next = Number(days);
    if (!Number.isFinite(next) || next === this.periodDays) return;

    this.periodDays = next;
    this.refresh(true);
  }

  readinessPercent(ready = 0, total = 0): number {
    const totalValue = Number(total || 0);
    if (!totalValue) return 0;
    return Math.round((Number(ready || 0) / totalValue) * 100);
  }

  safeNumber(value: unknown): string {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? String(numberValue) : '—';
  }

  safeText(value: unknown, fallback = '—'): string {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text.length ? text : fallback;
  }

  percent(value: number, max: number): number {
    return Math.max(4, Math.min(100, Math.round((Number(value || 0) / Math.max(1, Number(max || 0))) * 100)));
  }

  maxDeliveries(rows: AnalyticsV2DeliveryTopRow[] | undefined): number {
    return Math.max(1, ...(rows ?? []).map((row) => Number(row.deliveries || 0)));
  }

  maxTasks(rows: AnalyticsV2FirePositionTaskRow[] | undefined): number {
    return Math.max(1, ...(rows ?? []).map((row) => Number(row.completedTasks || 0)));
  }

  topDeliveries(limit = 10): AnalyticsV2DeliveryTopRow[] {
    return (this.data?.deliveriesTop ?? []).slice(0, limit);
  }

  topTasks(limit = 10): AnalyticsV2FirePositionTaskRow[] {
    return (this.data?.tasksTopByFirePosition ?? []).slice(0, limit);
  }

  urgentAmmo(limit = 12): AnalyticsV2AmmoForecastRow[] {
    return (this.data?.ammoForecast ?? [])
      .filter((row) => row.level === 'critical' || row.level === 'warning' || Number(row.shellBalance || 0) <= 50)
      .slice(0, limit);
  }

  urgentRotation(limit = 12): AnalyticsV2RotationRow[] {
    return (this.data?.rotation ?? []).slice(0, limit);
  }

  efficiencyTop(limit = 8): AnalyticsV2WeaponEfficiencyRow[] {
    return (this.data?.weaponEfficiency.top ?? []).slice(0, limit);
  }

  efficiencyBottom(limit = 8): AnalyticsV2WeaponEfficiencyRow[] {
    return (this.data?.weaponEfficiency.bottom ?? []).slice(0, limit);
  }

  levelLabel(level: string): string {
    if (level === 'critical') return 'Критично';
    if (level === 'warning') return 'Увага';
    if (level === 'overdue') return 'Прострочено';
    if (level === 'soon') return 'Скоро';
    if (level === 'unknown') return 'Немає даних';
    return 'Норма';
  }

  levelClass(level: string): string {
    if (level === 'critical' || level === 'overdue') return 'danger';
    if (level === 'warning' || level === 'soon' || level === 'unknown') return 'warning';
    return 'ok';
  }

  daysLeftText(row: AnalyticsV2AmmoForecastRow): string {
    if (row.estimatedDaysLeft === null || row.estimatedDaysLeft === undefined) return 'немає витрати';
    return `${row.estimatedDaysLeft} діб`;
  }

  trackByIndex(index: number): number { return index; }
  trackByAttention(index: number, item: AnalyticsV2AttentionItem): string { return `${item.title}-${item.level}-${index}`; }
  trackByReason(index: number, item: AnalyticsV2ReadinessReasonRow): string { return `${item.reason}-${index}`; }
  trackByDelivery(index: number, item: AnalyticsV2DeliveryTopRow): string { return item.firePositionId ?? `${item.firePositionName}-${index}`; }
  trackByTask(index: number, item: AnalyticsV2FirePositionTaskRow): string { return item.firePositionId ?? `${item.firePositionName}-${index}`; }
  trackByLowAmmo(index: number, item: AnalyticsV2LowAmmoRow): string { return item.firePositionId ?? `${item.firePositionName}-${index}`; }
  trackByAmmo(index: number, item: AnalyticsV2AmmoForecastRow): string { return item.firePositionId ?? `${item.firePositionName}-${index}`; }
  trackByRotation(index: number, item: AnalyticsV2RotationRow): string { return item.firePositionId ?? `${item.firePositionName}-${index}`; }
  trackByWeaponEfficiency(index: number, item: AnalyticsV2WeaponEfficiencyRow): string { return item.weaponSystemId ?? `${item.weaponName}-${index}`; }

  private normalizeAnalytics(data: OperationalAnalyticsV2): OperationalAnalyticsV2 {
    return {
      ...data,
      readiness: {
        weapons: {
          total: data.readiness?.weapons?.total ?? 0,
          ready: data.readiness?.weapons?.ready ?? 0,
          notReady: data.readiness?.weapons?.notReady ?? 0,
          unknown: data.readiness?.weapons?.unknown ?? 0,
          notReadyReasons: data.readiness?.weapons?.notReadyReasons ?? [],
        },
        firePositions: {
          total: data.readiness?.firePositions?.total ?? 0,
          ready: data.readiness?.firePositions?.ready ?? 0,
          notReady: data.readiness?.firePositions?.notReady ?? 0,
          unknown: data.readiness?.firePositions?.unknown ?? 0,
          notReadyReasons: data.readiness?.firePositions?.notReadyReasons ?? [],
          threatNotReady: data.readiness?.firePositions?.threatNotReady ?? [],
        },
      },
      deliveriesTop: data.deliveriesTop ?? [],
      tasksTopByFirePosition: data.tasksTopByFirePosition ?? [],
      lowAmmoFirePositions: data.lowAmmoFirePositions ?? [],
      rotation: data.rotation ?? [],
      ammoForecast: data.ammoForecast ?? [],
      threatBlockedFirePositions: data.threatBlockedFirePositions ?? [],
      weaponEfficiency: {
        top: data.weaponEfficiency?.top ?? [],
        bottom: data.weaponEfficiency?.bottom ?? [],
      },
      attention: data.attention ?? [],
    };
  }
}
