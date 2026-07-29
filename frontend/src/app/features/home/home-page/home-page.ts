import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatKyivDateTime, minutesSince } from '../../../core/kyiv-time.util';
import { resolveLeafletModule } from '../../../shared/leaflet-module';
import { AirThreat } from '../../air-threats/air-threat.model';
import { AirThreatsService } from '../../air-threats/air-threats.service';
import { FirePosition } from '../../fire-positions/fire-position.model';
import { FirePositionsService } from '../../fire-positions/fire-positions.service';
import type * as Leaflet from 'leaflet';
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

interface OperatorQueueItem {
  label: string;
  hint: string;
  action: string;
  route: string;
  tone: 'danger' | 'warning' | 'success' | 'info';
  queryParams?: Record<string, string>;
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
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  private L?: typeof Leaflet;
  private dashboardMap?: Leaflet.Map;
  private dashboardMapLayer?: Leaflet.LayerGroup;
  private dashboardMapTileLayer?: Leaflet.TileLayer;
  private readonly autoRefreshSubscription = new Subscription();
  private dashboardRequest?: Subscription;
  private refreshQueued = false;
  orders: ServiceOrder[] = [];
  threats: AirThreat[] = [];
  firePositions: FirePosition[] = [];
  dashboard: AnalyticsDashboard | null = null;
  loading = true;
  refreshing = false;
  errorMessage = '';
  lastSyncLabel = '—';
  miniMapFallback = false;
  readonly dashboardSkeleton = Array.from({ length: 8 });

  constructor(
    private readonly ordersService: ServiceOrdersService,
    private readonly threatsService: AirThreatsService,
    private readonly firePositionsService: FirePositionsService,
    private readonly analytics: AnalyticsService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(
        ['missions', 'stock', 'map', 'analytics', 'events', 'weapons', 'threats'],
        () => this.load(),
      ),
    );
  }

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.L = resolveLeafletModule(await import('leaflet'));
    queueMicrotask(() => this.initDashboardMap());
    setTimeout(() => this.initDashboardMap(), 120);
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
      {
        label: 'Створити ВГЗ',
        hint: 'нове вогневе завдання',
        route: '/service-orders',
        queryParams: { create: 'true', view: 'cards' },
        hotkey: 'N',
      },
      { label: 'Карта обстановки', hint: 'ВП, загрози, склади', route: '/map', hotkey: 'M' },
      {
        label: 'Передача БК',
        hint: 'уніфікована логістика',
        route: '/stock-movements',
        hotkey: 'L',
      },
      { label: 'Аналітика', hint: 'готовність і витрати', route: '/analytics', hotkey: 'A' },
    ];
  }

  get operatorQueue(): OperatorQueueItem[] {
    const queue: OperatorQueueItem[] = [];

    if (this.attentionOrders.length > 0) {
      queue.push({
        label: `${this.attentionOrders.length} ВГЗ потребують дії`,
        hint: 'Підібрати ВП, прийняти або закрити відхилення',
        action: 'Відкрити ВГЗ',
        route: '/service-orders',
        queryParams: { filter: 'needs_action', view: 'list' },
        tone: 'danger',
      });
    }

    if (this.activeThreats.length > 0) {
      queue.push({
        label: `${this.activeThreats.length} активних загроз`,
        hint: 'Перевірити карту та ВП у зоні ризику',
        action: 'На карту',
        route: '/map',
        tone: 'danger',
      });
    }

    if (this.criticalAmmoWarnings > 0) {
      queue.push({
        label: `${this.criticalAmmoWarnings} ризиків по БК`,
        hint: 'Подивитись прогноз залишків і підготувати передачу',
        action: 'Аналітика',
        route: '/analytics',
        tone: 'warning',
      });
    }

    if (this.notReadyFirePositions > 0) {
      queue.push({
        label: `${this.notReadyFirePositions} ВП не БГ`,
        hint: 'Перевірити причини та активні ВГЗ по цих позиціях',
        action: 'Відкрити ВП',
        route: '/fire-positions',
        tone: 'warning',
      });
    }

    if (this.workOrders.length > 0) {
      queue.push({
        label: `${this.workOrders.length} ВГЗ у роботі`,
        hint: 'Контролювати початок, виконання і завершення',
        action: 'Контроль',
        route: '/service-orders',
        queryParams: { filter: 'in_progress', view: 'list' },
        tone: 'info',
      });
    }

    if (queue.length === 0) {
      queue.push({
        label: 'Критичних дій немає',
        hint: 'Тримай відкритою карту та слідкуй за push-повідомленнями',
        action: 'Карта',
        route: '/map',
        tone: 'success',
      });
    }

    return queue.slice(0, 4);
  }

  get recentActivity(): DashboardActivityItem[] {
    const orderItems = this.orders
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      )
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
    return (
      this.dashboard?.firePositions?.total ?? this.readyFirePositions + this.notReadyFirePositions
    );
  }

  get readyWeapons(): number {
    return this.dashboard?.weapons?.ready ?? 0;
  }

  get totalWeapons(): number {
    return this.dashboard?.weapons?.total ?? this.readyWeapons + this.notReadyWeapons;
  }

  get activeOrders(): ServiceOrder[] {
    return this.orders.filter((item) =>
      [
        'draft',
        'proposed',
        'sent',
        'sent_to_division',
        'sent_to_battery',
        'accepted',
        'in_progress',
        'rejected',
      ].includes(item.status),
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
    if (
      this.attentionOrders.length > 0 ||
      this.notReadyFirePositions > 0 ||
      this.notReadyWeapons > 0
    )
      return 'warning';
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
      ['sent', 'sent_to_division', 'sent_to_battery', 'accepted', 'in_progress'].includes(
        item.status,
      ),
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
    return (this.dashboard?.warnings || []).filter(
      (warning) =>
        warning.toLowerCase().includes('бк') ||
        warning.toLowerCase().includes('боєприп') ||
        warning.toLowerCase().includes('ammo'),
    ).length;
  }

  get completedToday(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.orders.filter(
      (item) =>
        item.status === 'completed' && (item.completedAt || item.updatedAt || '').startsWith(today),
    ).length;
  }

  get activeThreats(): AirThreat[] {
    return this.threats.filter((item) => item.isActive);
  }

  ngOnDestroy(): void {
    this.dashboardRequest?.unsubscribe();
    this.autoRefreshSubscription.unsubscribe();
    this.dashboardMap?.remove();
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
    let loadHadError = false;

    this.dashboardRequest = forkJoin({
      orders: this.ordersService.getAll().pipe(
        catchError(() => {
          loadHadError = true;
          this.errorMessage = 'Не вдалося завантажити вогневі завдання';
          return of(this.orders);
        }),
      ),
      threats: this.threatsService.getAll().pipe(
        catchError(() => {
          loadHadError = true;
          return of(this.threats);
        }),
      ),
      firePositions: this.firePositionsService.getAllForMap().pipe(
        catchError(() => {
          loadHadError = true;
          return of(this.firePositions);
        }),
      ),
      dashboard: this.analytics.getDashboard().pipe(
        catchError(() => {
          loadHadError = true;
          return of(this.dashboard);
        }),
      ),
    })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.refreshing = false;
          this.cdr.detectChanges();

          if (this.refreshQueued) {
            this.refreshQueued = false;
            queueMicrotask(() => this.load());
          }
        }),
      )
      .subscribe(({ orders, threats, firePositions, dashboard }) => {
        this.orders = orders ?? [];
        this.threats = threats ?? [];
        this.firePositions = firePositions ?? [];
        this.dashboard = dashboard;
        queueMicrotask(() => this.renderDashboardMap());
        if (!loadHadError) {
          this.lastSyncLabel = this.shortTime(new Date());
        }
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
      {
        key: 'selected',
        label: 'ВП підібрано',
        rank: 2,
        time: order.selectedFirePosition ? order.updatedAt : null,
      },
      { key: 'sent', label: 'Надіслано', rank: 3, time: currentRank >= 3 ? order.updatedAt : null },
      {
        key: 'accepted',
        label: 'Прийнято',
        rank: 4,
        time: currentRank >= 4 ? order.updatedAt : null,
      },
      {
        key: 'progress',
        label: 'Виконується',
        rank: 5,
        time: order.startedAt || (currentRank >= 5 ? order.updatedAt : null),
      },
      { key: 'completed', label: 'Завершено', rank: 6, time: order.completedAt },
    ];

    if (isRejected || isCancelled) {
      return [
        ...baseSteps
          .filter((step) => step.rank < Math.max(currentRank, 3))
          .map((step) => ({
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
      state:
        step.rank < currentRank
          ? ('done' as const)
          : step.rank === currentRank
            ? ('current' as const)
            : ('pending' as const),
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

  trackByOrder(_: number, item: ServiceOrder): string {
    return item.id;
  }

  get mapReadyFirePositions(): FirePosition[] {
    return this.firePositions.filter((item) => item.readinessStatus === 'ready');
  }

  get mapNotReadyFirePositions(): FirePosition[] {
    return this.firePositions.filter((item) => item.readinessStatus === 'not_ready');
  }

  private initDashboardMap(): void {
    if (!this.L || this.dashboardMap) {
      return;
    }

    const container = document.getElementById('dashboard-mini-map');
    if (!container) {
      return;
    }

    if (container.clientWidth === 0 || container.clientHeight === 0) {
      setTimeout(() => this.initDashboardMap(), 120);
      return;
    }

    this.dashboardMap = this.L.map(container, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      preferCanvas: true,
    }).setView([50.45, 34.8], 8);

    this.dashboardMapTileLayer = this.L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        maxZoom: 19,
        crossOrigin: true,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      },
    );
    this.dashboardMapTileLayer.on('tileerror', () => {
      this.miniMapFallback = true;
      this.cdr.detectChanges();
    });
    this.dashboardMapTileLayer.on('load', () => {
      this.miniMapFallback = false;
      this.cdr.detectChanges();
    });
    this.dashboardMapTileLayer.addTo(this.dashboardMap);

    this.dashboardMapLayer = this.L.layerGroup().addTo(this.dashboardMap);
    this.scheduleDashboardMapResize();
    this.renderDashboardMap();
  }

  private renderDashboardMap(): void {
    if (
      !isPlatformBrowser(this.platformId) ||
      !this.L ||
      !this.dashboardMap ||
      !this.dashboardMapLayer
    ) {
      return;
    }

    this.dashboardMapLayer.clearLayers();
    const bounds: Leaflet.LatLngExpression[] = [];

    this.firePositions
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .forEach((position) => {
        const tone =
          position.readinessStatus === 'not_ready'
            ? 'danger'
            : position.readinessStatus === 'in_progress'
              ? 'info'
              : 'ready';
        const marker = this.L!.marker([position.lat, position.lng], {
          icon: this.L!.divIcon({
            className: `cc-live-marker cc-live-marker--${tone}`,
            html: `<span></span><em>ВП</em>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        });
        marker.bindTooltip(position.name, { direction: 'top', opacity: 0.9 });
        marker.addTo(this.dashboardMapLayer!);
        bounds.push([position.lat, position.lng]);

        const sector = this.buildDashboardSector(position);
        if (sector.length > 0) {
          this.L!.polygon(sector, {
            color: position.readinessStatus === 'not_ready' ? '#ff5f6d' : '#9d7cff',
            weight: 1,
            opacity: 0.58,
            fillColor: position.readinessStatus === 'not_ready' ? '#ff5f6d' : '#8b5cf6',
            fillOpacity: 0.1,
            interactive: false,
          }).addTo(this.dashboardMapLayer!);
        }
      });

    this.activeThreats
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .forEach((threat) => {
        this.L!.marker([threat.lat, threat.lng], {
          icon: this.L!.divIcon({
            className: 'cc-live-marker cc-live-marker--threat',
            html: `<span></span><em>!</em>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).addTo(this.dashboardMapLayer!);
        bounds.push([threat.lat, threat.lng]);
      });

    const origin = bounds[0];
    if (origin) {
      this.activeThreats
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
        .slice(0, 4)
        .forEach((threat) => {
          this.L!.polyline([origin, [threat.lat, threat.lng]], {
            color: '#2de7d6',
            weight: 1,
            opacity: 0.42,
            dashArray: '4 7',
            interactive: false,
          }).addTo(this.dashboardMapLayer!);
        });
    }

    this.scheduleDashboardMapResize();

    if (bounds.length > 0) {
      this.dashboardMap.fitBounds(this.L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 11 });
    } else {
      this.dashboardMap.setView([50.45, 34.8], 7);
    }

    this.scheduleDashboardMapResize();
  }

  private scheduleDashboardMapResize(): void {
    setTimeout(() => this.dashboardMap?.invalidateSize({ animate: false }), 0);
    setTimeout(() => this.dashboardMap?.invalidateSize({ animate: false }), 180);
  }

  private buildDashboardSector(position: FirePosition): Leaflet.LatLngExpression[] {
    if (
      !Number.isFinite(position.lat) ||
      !Number.isFinite(position.lng) ||
      position.sectorLeftDegrees === null ||
      position.sectorRightDegrees === null
    ) {
      return [];
    }

    const radiusM =
      position.maxSectorDistanceM && position.maxSectorDistanceM > 0
        ? position.maxSectorDistanceM
        : 3000;

    return this.buildSectorPoints(
      position.lat,
      position.lng,
      position.sectorLeftDegrees,
      position.sectorRightDegrees,
      radiusM,
    );
  }

  private buildSectorPoints(
    lat: number,
    lng: number,
    leftDeg: number,
    rightDeg: number,
    radiusM: number,
  ): Leaflet.LatLngExpression[] {
    const points: Leaflet.LatLngExpression[] = [[lat, lng]];
    let start = leftDeg;
    let end = rightDeg;

    if (end < start) {
      end += 360;
    }

    for (let angle = start; angle <= end; angle += 3) {
      points.push(this.destinationPoint(lat, lng, angle % 360, radiusM));
    }

    points.push(this.destinationPoint(lat, lng, end % 360, radiusM));
    points.push([lat, lng]);

    return points;
  }

  private destinationPoint(
    lat: number,
    lng: number,
    bearingDeg: number,
    distanceM: number,
  ): Leaflet.LatLngExpression {
    const earthRadiusM = 6371000;
    const bearing = (bearingDeg * Math.PI) / 180;
    const lat1 = (lat * Math.PI) / 180;
    const lng1 = (lng * Math.PI) / 180;
    const angularDistance = distanceM / earthRadiusM;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
    );

    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
      );

    return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
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
    if (order.status === 'in_progress' && this.minutes(order.startedAt || order.updatedAt) > 180)
      return true;
    if (
      ['sent', 'sent_to_division', 'sent_to_battery'].includes(order.status) &&
      this.minutes(order.updatedAt || order.createdAt) > 90
    )
      return true;
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
