import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
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
  AnalyticsV2ProblemFirePositionRow,
  AnalyticsV2ReadinessReasonRow,
  AnalyticsV2RotationRow,
  AnalyticsV2WeaponEfficiencyRow,
  OperationalAnalyticsV2,
} from '../analytics.model';
import { AnalyticsService } from '../analytics.service';

type AnalyticsLevel = 'critical' | 'warning' | 'info' | 'ok';
type AnalyticsTab = 'overview' | 'efficiency' | 'logistics' | 'forecast' | 'history';
type AnalyticsSection =
  | 'deliveries'
  | 'tasks'
  | 'ammo'
  | 'rotation'
  | 'bestWeapons'
  | 'worstWeapons'
  | 'problems'
  | 'dynamics';

interface AnalyticsProblemRow {
  id: string;
  level: AnalyticsLevel;
  type: string;
  object: string;
  details: string;
  action: string;
}

interface AnalyticsSimpleRow {
  label: string;
  value: number;
  detail: string;
  level: AnalyticsLevel;
}

interface AnalyticsLogisticsSummaryRow {
  label: string;
  value: number;
  detail: string;
  level: AnalyticsLevel;
}

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
  activeTab: AnalyticsTab = 'overview';

  readonly skeletonItems = Array.from({ length: 8 }, (_, index) => index);

  private readonly subscriptions = new Subscription();
  private analyticsRequest?: Subscription;
  private requestId = 0;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly autoRefresh: AutoRefreshService,
    private readonly cdr: ChangeDetectorRef,
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
    if ((this.loading || this.refreshing) && !force) return;

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
          this.cdr.detectChanges();
        }),
      )
      .subscribe((data) => {
        if (!data || requestId !== this.requestId) return;

        this.data = this.normalizeAnalytics(data);
        this.lastUpdatedAt = new Date();
        this.cdr.detectChanges();
      });
  }

  setPeriod(days: number): void {
    const next = Number(days);
    if (!Number.isFinite(next) || next === this.periodDays) return;

    this.periodDays = next;
    this.data = null;
    this.lastUpdatedAt = null;
    this.refresh(true, true);
    this.cdr.detectChanges();
  }

  onPeriodSelect(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.setPeriod(Number(target?.value));
  }

  setActiveTab(tab: AnalyticsTab): void {
    this.activeTab = tab;

    if (!this.data && !this.loading && !this.refreshing) {
      this.refresh(true, true);
    }
  }

  showAnalyticsSection(section: AnalyticsSection): boolean {
    const visibleByTab: Record<AnalyticsTab, AnalyticsSection[]> = {
      overview: ['deliveries', 'tasks', 'ammo', 'problems', 'dynamics'],
      efficiency: ['tasks', 'bestWeapons', 'worstWeapons', 'dynamics'],
      logistics: ['deliveries', 'ammo', 'problems'],
      forecast: ['ammo', 'rotation', 'problems'],
      history: ['deliveries', 'tasks', 'dynamics'],
    };

    return visibleByTab[this.activeTab].includes(section);
  }

  totalCompletedTasks(): number {
    return (
      this.number(this.data?.serviceOrders?.completed) ||
      this.number(this.data?.shooting?.totalMissions) ||
      this.topTasks().reduce((sum, row) => sum + this.number(row.completedTasks), 0)
    );
  }

  totalMovedAmmo(): number {
    return (
      this.number(this.data?.logistics?.totalQuantity) ||
      this.topDeliveries().reduce((sum, row) => sum + this.deliveryQuantity(row), 0)
    );
  }

  totalCriticalProblems(): number {
    return this.problemZones().filter((row) => row.level === 'critical').length;
  }

  totalAttentionProblems(): number {
    return this.problemZones().filter((row) => row.level !== 'ok').length;
  }

  totalLowAmmo(): number {
    return this.data?.lowAmmoFirePositions.length ?? 0;
  }

  readinessPercent(ready = 0, total = 0): number {
    const totalValue = Number(total || 0);
    if (!totalValue) return 0;
    return Math.round((Number(ready || 0) / totalValue) * 100);
  }

  safeNumber(value: unknown): string {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? String(Math.round(numberValue)) : '—';
  }

  safeText(value: unknown, fallback = '—'): string {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text.length ? text : fallback;
  }

  percent(value: number, max: number): number {
    return Math.max(
      4,
      Math.min(100, Math.round((Number(value || 0) / Math.max(1, Number(max || 0))) * 100)),
    );
  }

  maxDeliveries(rows: AnalyticsV2DeliveryTopRow[] | undefined): number {
    return Math.max(1, ...(rows ?? []).map((row) => this.deliveryQuantity(row)));
  }

  maxTasks(rows: AnalyticsV2FirePositionTaskRow[] | undefined): number {
    return Math.max(1, ...(rows ?? []).map((row) => Number(row.completedTasks || 0)));
  }

  topDeliveries(limit = 10): AnalyticsV2DeliveryTopRow[] {
    return [...(this.data?.deliveriesTop ?? [])]
      .sort((a, b) => this.deliveryQuantity(b) - this.deliveryQuantity(a))
      .slice(0, limit);
  }

  topTasks(limit = 10): AnalyticsV2FirePositionTaskRow[] {
    return [...(this.data?.tasksTopByFirePosition ?? [])]
      .sort((a, b) => this.number(b.completedTasks) - this.number(a.completedTasks))
      .slice(0, limit);
  }

  urgentAmmo(limit = 12): AnalyticsV2AmmoForecastRow[] {
    return [...(this.data?.ammoForecast ?? [])]
      .filter(
        (row) =>
          row.level === 'critical' ||
          row.level === 'warning' ||
          Number(row.shellBalance || 0) <= 50,
      )
      .sort((a, b) => this.levelWeight(a.level) - this.levelWeight(b.level))
      .slice(0, limit);
  }

  urgentRotation(limit = 12): AnalyticsV2RotationRow[] {
    return [...(this.data?.rotation ?? [])]
      .sort((a, b) => this.levelWeight((a as any).level) - this.levelWeight((b as any).level))
      .slice(0, limit);
  }

  efficiencyTop(limit = 8): AnalyticsV2WeaponEfficiencyRow[] {
    return [...(this.data?.weaponEfficiency.top ?? [])]
      .sort(
        (a, b) =>
          this.number((b as any).efficiencyPercent) - this.number((a as any).efficiencyPercent),
      )
      .slice(0, limit);
  }

  efficiencyBottom(limit = 8): AnalyticsV2WeaponEfficiencyRow[] {
    return [...(this.data?.weaponEfficiency.bottom ?? [])]
      .sort(
        (a, b) =>
          this.number((a as any).efficiencyPercent) - this.number((b as any).efficiencyPercent),
      )
      .slice(0, limit);
  }

  problemZones(limit = 12): AnalyticsProblemRow[] {
    const rows: AnalyticsProblemRow[] = [];

    for (const item of this.data?.attention ?? []) {
      rows.push({
        id: `attention-${item.title}-${item.level}`,
        level: this.toLevel(item.level),
        type: 'Подія',
        object: this.safeText(item.title, 'Увага'),
        details: this.safeText(item.details, 'Потрібна перевірка'),
        action: 'Перевірити',
      });
    }

    for (const row of this.data?.lowAmmoFirePositions ?? []) {
      rows.push({
        id: `low-ammo-${row.firePositionId ?? row.firePositionName}`,
        level: 'critical',
        type: 'БК',
        object: this.safeText(row.firePositionName, 'ВП'),
        details: `залишок снарядів ${this.safeNumber((row as any).shellBalance)}`,
        action: 'Підвіз',
      });
    }

    for (const row of this.urgentAmmo(8)) {
      rows.push({
        id: `forecast-${row.firePositionId ?? row.firePositionName}`,
        level: this.toLevel(row.level),
        type: 'Прогноз',
        object: this.safeText(row.firePositionName, 'ВП'),
        details: `БК: ${this.safeNumber(row.shellBalance)} · ${this.daysLeftText(row)}`,
        action: 'План БК',
      });
    }

    for (const row of this.data?.readiness.firePositions.notReadyReasons ?? []) {
      rows.push({
        id: `fp-reason-${row.reason}`,
        level: 'warning',
        type: 'ВП',
        object: this.safeText(row.reason, 'Причина'),
        details: `${this.safeNumber((row as any).total ?? (row as any).count)} випадків`,
        action: 'Готовність',
      });
    }

    for (const row of this.data?.readiness.weapons.notReadyReasons ?? []) {
      rows.push({
        id: `weapon-reason-${row.reason}`,
        level: 'warning',
        type: 'СГ',
        object: this.safeText(row.reason, 'Причина'),
        details: `${this.safeNumber((row as any).total ?? (row as any).count)} випадків`,
        action: 'Ремонт',
      });
    }

    return rows
      .sort((a, b) => this.levelWeight(a.level) - this.levelWeight(b.level))
      .slice(0, limit);
  }

  logisticsSummary(): AnalyticsLogisticsSummaryRow[] {
    const logistics = this.data?.logistics;
    const lowAmmo = this.number(logistics?.lowAmmoCount) || this.totalLowAmmo();

    const rows: AnalyticsLogisticsSummaryRow[] = [
      {
        label: 'Підвозів',
        value:
          this.number(logistics?.deliveries) ||
          this.topDeliveries().reduce((sum, row) => sum + this.number(row.deliveries), 0),
        detail: `за ${this.periodDays} діб`,
        level: 'info',
      },
      {
        label: 'Переміщено БК',
        value: this.totalMovedAmmo(),
        detail: 'сумарна кількість',
        level: 'ok',
      },
      {
        label: 'Критичний БК',
        value: lowAmmo,
        detail: 'ВП з низькими залишками',
        level: lowAmmo > 0 ? 'warning' : 'ok',
      },
    ];

    return rows;
  }

  topDeliveryCountRows(limit = 8): AnalyticsV2DeliveryTopRow[] {
    return [...(this.data?.deliveriesTop ?? [])]
      .sort((a, b) => this.number(b.deliveries) - this.number(a.deliveries))
      .slice(0, limit);
  }

  ammoTypeRows(): AnalyticsSimpleRow[] {
    const logistics = this.data?.logistics;

    const rows: AnalyticsSimpleRow[] = [
      {
        label: 'Снаряди',
        value: this.number(logistics?.shells),
        detail: 'переміщено',
        level: 'info',
      },
      {
        label: 'Заряди',
        value: this.number(logistics?.charges),
        detail: 'переміщено',
        level: 'ok',
      },
      {
        label: 'Підривники',
        value: this.number(logistics?.fuzes),
        detail: 'переміщено',
        level: 'warning',
      },
      {
        label: 'Капсулі',
        value: this.number(logistics?.primers),
        detail: 'переміщено',
        level: 'info',
      },
    ];

    return rows.filter((row) => row.value > 0);
  }

  ammoChartRows(): AnalyticsSimpleRow[] {
    const rows = this.ammoTypeRows();
    if (rows.length) return rows.slice(0, 5);

    return this.dailyRows(5)
      .map((row) => ({
        ...row,
        value: this.number(row.detail.replace(/[^0-9.-]/g, '')),
      }))
      .filter((row) => row.value > 0);
  }

  missionLinePoints(): string {
    const rows = this.dailyRows(5);
    if (!rows.length) return '';

    const max = this.maxSimple(rows);
    return rows
      .map((row, index) => {
        const x = rows.length === 1 ? 150 : Math.round((index / (rows.length - 1)) * 300);
        const y = Math.round(94 - (this.percent(row.value, max) / 100) * 72);
        return `${x},${y}`;
      })
      .join(' ');
  }

  missionAreaPoints(): string {
    const line = this.missionLinePoints();
    if (!line) return '';
    return `0,100 ${line} 300,100`;
  }

  serviceStatusRows(): AnalyticsSimpleRow[] {
    const rows = this.data?.serviceOrders?.statuses ?? [];
    return rows.map((row) => ({
      label: this.statusLabel(row.status),
      value: this.number(row.total),
      detail: row.status,
      level: this.statusLevel(row.status),
    }));
  }

  readinessCategoryRows(): AnalyticsSimpleRow[] {
    const categories: Record<string, AnalyticsSimpleRow> = {
      air: {
        label: 'Повітряна небезпека',
        value: 0,
        detail: 'ВП не БГ через обстановку',
        level: 'warning',
      },
      technical: {
        label: 'Технічна причина',
        value: 0,
        detail: 'СГ / ремонт / несправність',
        level: 'critical',
      },
      ammo: { label: 'БК', value: 0, detail: 'нестача або прогноз вичерпання', level: 'warning' },
      other: { label: 'Інше', value: 0, detail: 'потребує уточнення', level: 'info' },
    };

    for (const row of this.data?.readiness.firePositions.threatNotReady ?? []) {
      categories['air'].value += this.number(row.total);
    }

    for (const row of this.data?.readiness.firePositions.notReadyReasons ?? []) {
      const key = this.reasonCategory(row.reason);
      categories[key].value += this.number(row.total);
    }

    for (const row of this.data?.readiness.weapons.notReadyReasons ?? []) {
      categories['technical'].value += this.number(row.total);
    }

    categories['ammo'].value += this.number(this.data?.logistics?.lowAmmoCount);
    categories['ammo'].value += this.number(this.data?.logistics?.criticalForecastCount);

    return Object.values(categories).filter((row) => row.value > 0);
  }

  worstReadinessReasons(limit = 8): AnalyticsV2ReadinessReasonRow[] {
    return [
      ...(this.data?.readiness.firePositions.notReadyReasons ?? []),
      ...(this.data?.readiness.weapons.notReadyReasons ?? []),
    ]
      .sort((a, b) => this.number(b.total) - this.number(a.total))
      .slice(0, limit);
  }

  problemFirePositions(limit = 12): AnalyticsV2ProblemFirePositionRow[] {
    return [...(this.data?.problemFirePositions ?? [])]
      .sort(
        (a, b) => this.problemCategoryWeight(a.category) - this.problemCategoryWeight(b.category),
      )
      .slice(0, limit);
  }

  problemCategoryLabel(category: AnalyticsV2ProblemFirePositionRow['category']): string {
    if (category === 'air') return 'Повітря';
    if (category === 'technical') return 'Техніка';
    if (category === 'weapon') return 'СГ';
    if (category === 'ammo') return 'БК';
    return 'Інше';
  }

  dailyRows(limit = 10): AnalyticsSimpleRow[] {
    const rows: AnalyticsSimpleRow[] = (this.data?.shooting?.daily ?? [])
      .slice(-limit)
      .map((row) => ({
        label: String(row.day).slice(5),
        value: this.number(row.missions),
        detail: `${this.safeNumber(row.actualQuantity)} БК`,
        level: this.number(row.missions) > 0 ? 'info' : 'ok',
      }));

    return rows;
  }

  deliveryQuantity(row: AnalyticsV2DeliveryTopRow): number {
    return this.number((row as any).totalQuantity ?? (row as any).deliveries ?? 0);
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
    if (level === 'info') return 'info';
    return 'ok';
  }

  daysLeftText(row: AnalyticsV2AmmoForecastRow): string {
    if (row.estimatedDaysLeft === null || row.estimatedDaysLeft === undefined)
      return 'немає витрати';
    return `${row.estimatedDaysLeft} діб`;
  }

  trackByIndex(index: number): number {
    return index;
  }
  trackByAttention(index: number, item: AnalyticsV2AttentionItem): string {
    return `${item.title}-${item.level}-${index}`;
  }
  trackByReason(index: number, item: AnalyticsV2ReadinessReasonRow): string {
    return `${item.reason}-${index}`;
  }
  trackByDelivery(index: number, item: AnalyticsV2DeliveryTopRow): string {
    return item.firePositionId ?? `${item.firePositionName}-${index}`;
  }
  trackByTask(index: number, item: AnalyticsV2FirePositionTaskRow): string {
    return item.firePositionId ?? `${item.firePositionName}-${index}`;
  }
  trackByLowAmmo(index: number, item: AnalyticsV2LowAmmoRow): string {
    return item.firePositionId ?? `${item.firePositionName}-${index}`;
  }
  trackByAmmo(index: number, item: AnalyticsV2AmmoForecastRow): string {
    return item.firePositionId ?? `${item.firePositionName}-${index}`;
  }
  trackByRotation(index: number, item: AnalyticsV2RotationRow): string {
    return item.firePositionId ?? `${item.firePositionName}-${index}`;
  }
  trackByWeaponEfficiency(index: number, item: AnalyticsV2WeaponEfficiencyRow): string {
    return item.weaponSystemId ?? `${item.weaponName}-${index}`;
  }
  trackByProblem(index: number, item: AnalyticsProblemRow): string {
    return item.id || String(index);
  }
  trackBySummary(index: number, item: AnalyticsLogisticsSummaryRow): string {
    return item.label;
  }

  statusLabel(status: string): string {
    if (status === 'draft') return 'Чернетки';
    if (status === 'sent') return 'Надіслані';
    if (status === 'accepted') return 'Прийняті';
    if (status === 'in_progress') return 'В роботі';
    if (status === 'completed') return 'Виконані';
    if (status === 'rejected') return 'Відхилені';
    if (status === 'cancelled') return 'Скасовані';
    return this.safeText(status, 'Невідомо');
  }

  statusLevel(status: string): AnalyticsLevel {
    if (status === 'completed') return 'ok';
    if (status === 'rejected' || status === 'cancelled') return 'warning';
    if (status === 'in_progress' || status === 'accepted' || status === 'sent') return 'info';
    return 'ok';
  }

  maxSimple(rows: AnalyticsSimpleRow[] | undefined): number {
    return Math.max(1, ...(rows ?? []).map((row) => this.number(row.value)));
  }

  trackBySimple(index: number, item: AnalyticsSimpleRow): string {
    return `${item.label}-${index}`;
  }

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
      serviceOrders: {
        total: data.serviceOrders?.total ?? 0,
        active: data.serviceOrders?.active ?? 0,
        sent: data.serviceOrders?.sent ?? 0,
        accepted: data.serviceOrders?.accepted ?? 0,
        inProgress: data.serviceOrders?.inProgress ?? 0,
        completed: data.serviceOrders?.completed ?? 0,
        rejected: data.serviceOrders?.rejected ?? 0,
        cancelled: data.serviceOrders?.cancelled ?? 0,
        completionRate: data.serviceOrders?.completionRate ?? 0,
        averageActualQuantity: data.serviceOrders?.averageActualQuantity ?? 0,
        statuses: data.serviceOrders?.statuses ?? [],
      },
      shooting: {
        days: data.shooting?.days ?? data.periodDays ?? this.periodDays,
        totalMissions: data.shooting?.totalMissions ?? 0,
        totalActualQuantity: data.shooting?.totalActualQuantity ?? 0,
        averageActualQuantity: data.shooting?.averageActualQuantity ?? 0,
        daily: data.shooting?.daily ?? [],
        byUnit: data.shooting?.byUnit ?? [],
        byFirePosition: data.shooting?.byFirePosition ?? [],
        byResultType: data.shooting?.byResultType ?? [],
        byTaskType: data.shooting?.byTaskType ?? [],
        byShell: data.shooting?.byShell ?? [],
        byCharge: data.shooting?.byCharge ?? [],
      },
      logistics: {
        deliveries: data.logistics?.deliveries ?? 0,
        totalQuantity: data.logistics?.totalQuantity ?? 0,
        shells: data.logistics?.shells ?? 0,
        charges: data.logistics?.charges ?? 0,
        fuzes: data.logistics?.fuzes ?? 0,
        primers: data.logistics?.primers ?? 0,
        lowAmmoCount: data.logistics?.lowAmmoCount ?? 0,
        criticalForecastCount: data.logistics?.criticalForecastCount ?? 0,
        warningForecastCount: data.logistics?.warningForecastCount ?? 0,
      },
      deliveriesTop: data.deliveriesTop ?? [],
      tasksTopByFirePosition: data.tasksTopByFirePosition ?? [],
      lowAmmoFirePositions: data.lowAmmoFirePositions ?? [],
      rotation: data.rotation ?? [],
      ammoForecast: data.ammoForecast ?? [],
      threatBlockedFirePositions: data.threatBlockedFirePositions ?? [],
      problemFirePositions: data.problemFirePositions ?? [],
      weaponEfficiency: {
        top: data.weaponEfficiency?.top ?? [],
        bottom: data.weaponEfficiency?.bottom ?? [],
      },
      attention: data.attention ?? [],
    };
  }

  private number(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private toLevel(level: string): AnalyticsLevel {
    if (level === 'critical') return 'critical';
    if (level === 'warning') return 'warning';
    if (level === 'info') return 'info';
    return 'ok';
  }

  private levelWeight(level: string): number {
    if (level === 'critical' || level === 'overdue') return 0;
    if (level === 'warning' || level === 'soon' || level === 'unknown') return 1;
    if (level === 'info') return 2;
    return 3;
  }

  private reasonCategory(reason: string): 'air' | 'technical' | 'ammo' | 'other' {
    const value = reason.toLowerCase();

    if (value.includes('повіт') || value.includes('загроз') || value.includes('air')) return 'air';
    if (
      value.includes('бк') ||
      value.includes('снар') ||
      value.includes('заряд') ||
      value.includes('ammo')
    )
      return 'ammo';
    if (
      value.includes('сг') ||
      value.includes('ремонт') ||
      value.includes('тех') ||
      value.includes('weapon')
    )
      return 'technical';

    return 'other';
  }

  private problemCategoryWeight(category: AnalyticsV2ProblemFirePositionRow['category']): number {
    if (category === 'air') return 0;
    if (category === 'technical' || category === 'weapon') return 1;
    if (category === 'ammo') return 2;
    return 3;
  }
}
