import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatKyivDateTime, minutesSince } from '../../../core/kyiv-time.util';
import { AirThreat } from '../../air-threats/air-threat.model';
import { AirThreatsService } from '../../air-threats/air-threats.service';
import { AuthService } from '../../auth/auth.service';
import { ServiceOrder } from '../../service-orders/service-order.model';
import { ServiceOrdersService } from '../../service-orders/service-orders.service';
import { AnalyticsDashboard } from '../../analytics/analytics.model';
import { AnalyticsService } from '../../analytics/analytics.service';
import { forkJoin, of, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { catchError, finalize } from 'rxjs/operators';


interface CommandDashboardCard {
  label: string;
  value: string | number;
  hint: string;
  tone: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
  route: string;
  queryParams?: Record<string, string>;
}

interface DashboardActivityItem {
  time: string;
  title: string;
  details: string;
  tone: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
}

interface DashboardActionItem {
  label: string;
  hint: string;
  route: string;
  queryParams?: Record<string, string>;
  hotkey?: string;
}


interface MissionTimelineStep {
  key: string;
  label: string;
  time: string;
  state: 'done' | 'current' | 'pending' | 'blocked';
}

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private dashboardRequest?: Subscription;
  private refreshQueued = false;
  orders: ServiceOrder[] = [];
  threats: AirThreat[] = [];
  dashboard: AnalyticsDashboard | null = null;
  loading = true;
  refreshing = false;
  errorMessage = '';
  lastSyncLabel = '—';
  readonly dashboardSkeleton = Array.from({ length: 8 });

  constructor(
    private readonly ordersService: ServiceOrdersService,
    private readonly threatsService: AirThreatsService,
    private readonly analytics: AnalyticsService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['missions', 'stock', 'map', 'analytics', 'events', 'weapons', 'threats'], () => this.load()));
  }

  get user() {
    return this.auth.getUser();
  }

  get scopeLabel(): string {
    const scope = this.user?.scope;
    if (scope === 'main') return 'Головний пункт управління';
    if (scope === 'division') return 'Дивізіон';
    if (scope === 'battery') return 'Батарея';
    return 'Робоче місце';
  }


  get commandCards(): CommandDashboardCard[] {
    return [
      {
        label: 'Потребують дії',
        value: this.attentionOrders.length,
        hint: 'негайний контроль',
        tone: this.attentionOrders.length > 0 ? 'danger' : 'success',
        route: '/service-orders',
        queryParams: { filter: 'needs_action', view: 'cards' },
      },
      {
        label: 'Активні ВГЗ',
        value: this.activeOrders.length,
        hint: 'відкриті вогневі завдання',
        tone: 'info',
        route: '/service-orders',
        queryParams: { view: 'cards' },
      },
      {
        label: 'У роботі',
        value: this.workOrders.length,
        hint: 'виконуються підрозділами',
        tone: this.workOrders.length > 0 ? 'warning' : 'neutral',
        route: '/service-orders',
        queryParams: { filter: 'in_progress', view: 'cards' },
      },
      {
        label: 'Завершено сьогодні',
        value: this.completedTodayCount,
        hint: 'закриті за добу',
        tone: 'success',
        route: '/service-orders',
        queryParams: { filter: 'today', view: 'cards' },
      },
      {
        label: 'Готові ВП',
        value: `${this.readyFirePositions} / ${this.totalFirePositions}`,
        hint: `${this.readinessRate}% готовності`,
        tone: this.notReadyFirePositions > 0 ? 'warning' : 'success',
        route: '/fire-positions',
      },
      {
        label: 'Готові СГ',
        value: `${this.readyWeapons} / ${this.totalWeapons}`,
        hint: this.notReadyWeapons > 0 ? `${this.notReadyWeapons} не БГ` : 'усі готові',
        tone: this.notReadyWeapons > 0 ? 'warning' : 'success',
        route: '/weapon-systems',
      },
      {
        label: 'Критичний БК',
        value: this.criticalAmmoWarnings,
        hint: 'попередження складу',
        tone: this.criticalAmmoWarnings > 0 ? 'danger' : 'success',
        route: '/analytics',
      },
      {
        label: 'Повітря',
        value: this.activeThreats.length,
        hint: 'активні загрози',
        tone: this.activeThreats.length > 0 ? 'danger' : 'success',
        route: '/air-threats',
      },
    ];
  }

  get quickActions(): DashboardActionItem[] {
    return [
      { label: 'Створити ВГЗ', hint: 'нове вогневе завдання', route: '/service-orders', queryParams: { create: 'true', view: 'cards' }, hotkey: 'N' },
      { label: 'Карта обстановки', hint: 'ВП, загрози, склади', route: '/map', hotkey: 'M' },
      { label: 'Передача БК', hint: 'уніфікована логістика', route: '/stock-movements', hotkey: 'L' },
      { label: 'Аналітика', hint: 'готовність і витрати', route: '/analytics', hotkey: 'A' },
    ];
  }

  get recentActivity(): DashboardActivityItem[] {
    const orderItems = this.orders
      .slice()
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 6)
      .map((order) => ({
        time: this.shortTime(order.updatedAt || order.createdAt),
        title: `${order.orderNumber} · ${this.statusLabel(order.status)}`,
        details: order.selectedFirePosition?.name || order.targetSettlement || 'район не вказано',
        tone: this.activityTone(order.status),
      }));

    const threatItems = this.activeThreats.slice(0, 3).map((threat) => ({
      time: this.shortTime(threat.createdAt),
      title: 'Повітряна загроза',
      details: threat.threatType || 'активна загроза',
      tone: 'danger' as const,
    }));

    return [...threatItems, ...orderItems].slice(0, 7);
  }

  get topFirePositions(): { name: string; total: number }[] {
    return (this.dashboard?.load?.byFirePosition ?? [])
      .filter((item) => item.name)
      .slice(0, 5)
      .map((item) => ({ name: item.name, total: item.total }));
  }

  get totalFirePositions(): number {
    return this.dashboard?.firePositions?.total ?? (this.readyFirePositions + this.notReadyFirePositions);
  }

  get readyWeapons(): number {
    return this.dashboard?.weapons?.ready ?? 0;
  }

  get totalWeapons(): number {
    return this.dashboard?.weapons?.total ?? (this.readyWeapons + this.notReadyWeapons);
  }

  get activeOrders(): ServiceOrder[] {
    return this.orders.filter((item) =>
      ['draft', 'proposed', 'sent', 'sent_to_division', 'sent_to_battery', 'accepted', 'in_progress', 'rejected'].includes(item.status),
    );
  }

  get plannedToday(): number {
    return this.dashboard?.fireMissions?.plannedToday ?? 0;
  }

  get completedTodayCount(): number {
    return this.dashboard?.serviceOrders?.completedToday ?? this.completedToday;
  }

  get notReadyWeapons(): number {
    return this.dashboard?.weapons?.notReady ?? 0;
  }

  get dashboardWarnings(): string[] {
    return (this.dashboard?.warnings ?? []).slice(0, 6);
  }

  get hasDashboardWarnings(): boolean {
    return this.dashboardWarnings.length > 0;
  }

  get readinessRate(): number {
    return this.dashboard?.kpi?.firePositionReadinessRate ?? 0;
  }

  get weaponReadinessRate(): number {
    return this.percent(this.readyWeapons, this.totalWeapons);
  }

  get firePositionReadinessRate(): number {
    return this.percent(this.readyFirePositions, this.totalFirePositions);
  }

  get logisticsRiskLevel(): 'danger' | 'warning' | 'success' {
    if (this.criticalAmmoWarnings > 0) return 'danger';
    if (this.dashboardWarnings.length > 0) return 'warning';
    return 'success';
  }

  get situationalTone(): 'danger' | 'warning' | 'success' {
    if (this.activeThreats.length > 0 || this.criticalAmmoWarnings > 0) return 'danger';
    if (this.attentionOrders.length > 0 || this.notReadyFirePositions > 0 || this.notReadyWeapons > 0) return 'warning';
    return 'success';
  }

  get attentionOrders(): ServiceOrder[] {
    return this.orders
      .filter((item) => this.needsAttention(item))
      .sort((a, b) => this.priority(b) - this.priority(a))
      .slice(0, 8);
  }

  get workOrders(): ServiceOrder[] {
    return this.orders.filter((item) =>
      ['sent', 'sent_to_division', 'sent_to_battery', 'accepted', 'in_progress'].includes(item.status),
    );
  }

  get draftOrders(): ServiceOrder[] {
    return this.orders.filter((item) => item.status === 'draft' || item.status === 'proposed');
  }


  get readyFirePositions(): number {
    return this.dashboard?.firePositions?.ready ?? 0;
  }

  get notReadyFirePositions(): number {
    return this.dashboard?.firePositions?.notReady ?? 0;
  }

  get criticalAmmoWarnings(): number {
    return (this.dashboard?.warnings || []).filter((warning) =>
      warning.toLowerCase().includes('бк') ||
      warning.toLowerCase().includes('боєприп') ||
      warning.toLowerCase().includes('ammo'),
    ).length;
  }

  get completedToday(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.orders.filter((item) => item.status === 'completed' && (item.completedAt || item.updatedAt || '').startsWith(today)).length;
  }

  get activeThreats(): AirThreat[] {
    return this.threats.filter((item) => item.isActive);
  }

  ngOnDestroy(): void {
    this.dashboardRequest?.unsubscribe();
    this.autoRefreshSubscription.unsubscribe();
  }

  load(): void {
    if (this.dashboardRequest && !this.dashboardRequest.closed) {
      this.refreshQueued = true;
      return;
    }

    const firstLoad = !this.orders.length && !this.threats.length && !this.dashboard;
    this.loading = firstLoad;
    this.refreshing = !firstLoad;
    this.errorMessage = '';

    this.dashboardRequest = forkJoin({
      orders: this.ordersService.getAll().pipe(
        catchError(() => {
          this.errorMessage = 'Не вдалося завантажити вогневі завдання';
          return of(this.orders);
        }),
      ),
      threats: this.threatsService.getAll().pipe(catchError(() => of(this.threats))),
      dashboard: this.analytics.getDashboard().pipe(catchError(() => of(this.dashboard))),
    })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.refreshing = false;
          this.lastSyncLabel = this.shortTime(new Date());
          this.cdr.detectChanges();

          if (this.refreshQueued) {
            this.refreshQueued = false;
            queueMicrotask(() => this.load());
          }
        }),
      )
      .subscribe(({ orders, threats, dashboard }) => {
        this.orders = orders ?? [];
        this.threats = threats ?? [];
        this.dashboard = dashboard;
      });
  }

  openOrder(order: ServiceOrder): void {
    void this.router.navigate(['/service-orders'], {
      queryParams: { filter: this.orderFilter(order.status), view: 'cards' },
    });
  }

  openOnMap(order: ServiceOrder): void {
    void this.router.navigate(['/map'], {
      queryParams: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        lat: order.targetLat,
        lng: order.targetLng,
        positionId: order.selectedFirePosition?.id || '',
      },
    });
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Чернетка',
      proposed: 'Підбір ВП',
      sent: 'Надіслано',
      sent_to_division: 'Передано дивізіону',
      sent_to_battery: 'Передано батареї',
      accepted: 'Прийнято',
      rejected: 'Відхилено',
      in_progress: 'У роботі',
      completed: 'Завершено',
      cancelled: 'Скасовано',
    };
    return map[status] || status;
  }

  statusClass(status: string): string {
    if (status === 'rejected' || this.isOverdueStatus(status)) return 'danger';
    if (status === 'in_progress') return 'progress';
    if (status === 'accepted') return 'accepted';
    if (status === 'draft' || status === 'proposed') return 'warning';
    return 'sent';
  }

  taskLabel(type: string): string {
    const map: Record<string, string> = {
      service: 'Бойове обслуговування',
      training: 'Тренування',
      smoke: 'Димова завіса',
      illumination: 'Освітлення',
      other: 'Інше',
    };
    return map[type] || type;
  }


  missionTimeline(order: ServiceOrder): MissionTimelineStep[] {
    const currentRank = this.timelineRank(order.status);
    const isRejected = order.status === 'rejected';
    const isCancelled = order.status === 'cancelled';
    const terminalTime = order.rejectedAt || order.completedAt || order.updatedAt;

    const baseSteps = [
      { key: 'created', label: 'Створено', rank: 1, time: order.createdAt },
      { key: 'selected', label: 'ВП підібрано', rank: 2, time: order.selectedFirePosition ? order.updatedAt : null },
      { key: 'sent', label: 'Надіслано', rank: 3, time: currentRank >= 3 ? order.updatedAt : null },
      { key: 'accepted', label: 'Прийнято', rank: 4, time: currentRank >= 4 ? order.updatedAt : null },
      { key: 'progress', label: 'Виконується', rank: 5, time: order.startedAt || (currentRank >= 5 ? order.updatedAt : null) },
      { key: 'completed', label: 'Завершено', rank: 6, time: order.completedAt },
    ];

    if (isRejected || isCancelled) {
      return [
        ...baseSteps.filter((step) => step.rank < Math.max(currentRank, 3)).map((step) => ({
          key: step.key,
          label: step.label,
          time: this.timelineTime(step.time),
          state: 'done' as const,
        })),
        {
          key: order.status,
          label: isRejected ? 'Відхилено' : 'Скасовано',
          time: this.timelineTime(terminalTime),
          state: 'blocked' as const,
        },
      ].slice(0, 6);
    }

    return baseSteps.map((step) => ({
      key: step.key,
      label: step.label,
      time: this.timelineTime(step.time),
      state: step.rank < currentRank ? 'done' as const : step.rank === currentRank ? 'current' as const : 'pending' as const,
    }));
  }

  trackByTimeline(_: number, item: MissionTimelineStep): string {
    return item.key;
  }

  formatTime(value: string | Date | null | undefined): string {
    return formatKyivDateTime(value);
  }

  minutes(value: string | null): number {
    return minutesSince(value || undefined);
  }

  shortTime(value: string | Date | null | undefined): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  trackByCard(_: number, item: CommandDashboardCard): string {
    return item.label;
  }

  trackByAction(_: number, item: DashboardActionItem): string {
    return item.label;
  }

  trackByActivity(_: number, item: DashboardActivityItem): string {
    return `${item.time}-${item.title}`;
  }


  private timelineRank(status: string): number {
    const ranks: Record<string, number> = {
      draft: 1,
      proposed: 2,
      sent: 3,
      sent_to_division: 3,
      sent_to_battery: 3,
      accepted: 4,
      in_progress: 5,
      completed: 6,
      rejected: 4,
      cancelled: 4,
    };
    return ranks[status] ?? 1;
  }

  private timelineTime(value: string | Date | null | undefined): string {
    return value ? this.shortTime(value) : '—';
  }

  private activityTone(status: string): DashboardActivityItem['tone'] {
    if (status === 'rejected' || status === 'cancelled') return 'danger';
    if (status === 'completed') return 'success';
    if (status === 'in_progress') return 'warning';
    if (status === 'accepted') return 'info';
    return 'neutral';
  }

  private needsAttention(order: ServiceOrder): boolean {
    if (order.status === 'completed' || order.status === 'cancelled') return false;
    if (order.status === 'draft') return this.user?.scope === 'main';
    if (order.status === 'proposed') return true;
    if (order.status === 'rejected') return true;
    if (!order.selectedFirePosition) return true;
    if (order.status === 'in_progress' && this.minutes(order.startedAt || order.updatedAt) > 180) return true;
    if (['sent', 'sent_to_division', 'sent_to_battery'].includes(order.status) && this.minutes(order.updatedAt || order.createdAt) > 90) return true;
    return false;
  }

  private priority(order: ServiceOrder): number {
    let score = 0;
    if (order.status === 'rejected') score += 100;
    if (!order.selectedFirePosition) score += 80;
    if (order.status === 'proposed') score += 70;
    if (order.status === 'in_progress') score += 60;
    score += Math.min(this.minutes(order.updatedAt || order.createdAt), 180) / 3;
    return score;
  }

  private percent(value: number, total: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
  }

  private isOverdueStatus(status: string): boolean {
    return status === 'rejected';
  }

  private orderFilter(status: string): string {
    if (status === 'rejected') return 'rejected';
    if (status === 'in_progress') return 'in_progress';
    if (status === 'draft' || status === 'proposed') return 'needs_action';
    return '';
  }
}
