import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AnalyticsService } from './features/analytics/analytics.service';
import { AuthService } from './features/auth/auth.service';
import { DepotsService } from './features/depots/depots.service';
import { FirePositionsService } from './features/fire-positions/fire-positions.service';
import { ServiceOrdersService } from './features/service-orders/service-orders.service';
import { WeaponSystemsService } from './features/weapon-systems/weapon-systems.service';
import { AutoRefreshService } from './core/auto-refresh.service';
import { RealtimeEventName, RealtimePayload, RealtimeService } from './core/realtime.service';
import { ToastContainerComponent } from './core/toast-container.component';
import { OperatorPushComponent } from './core/operator-push.component';
import { EventFeedService } from './core/event-feed.service';
import { OperationalNotificationOverlayComponent } from './features/notifications/operational-notification-overlay.component';
import { OperationalNotificationsService } from './features/notifications/operational-notifications.service';

type CommandEntity = 'page' | 'firePosition' | 'serviceOrder' | 'weaponSystem' | 'depot';
type NavGroup = 'situation' | 'missions' | 'logistics' | 'reference' | 'system';

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  route: string;
  entity: CommandEntity;
  keywords: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ToastContainerComponent,
    OperatorPushComponent,
    OperationalNotificationOverlayComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  isLoginPage = false;
  sidebarCollapsed = false;
  openedGroups: Record<NavGroup, boolean> = {
    situation: true,
    missions: true,
    logistics: true,
    reference: false,
    system: false,
  };
  actionOrdersCount = 0;
  activeThreatsCount = 0;
  realtimeConnected = false;
  realtimeLastEventLabel = 'Очікування подій';
  realtimeLastEventAt: Date | null = null;
  realtimeUpdatedAt: Date | null = null;
  realtimeEventsCount = 0;
  operationalUnreadCount = 0;
  commandOpen = false;
  commandQuery = '';
  commandLoading = false;
  commandItems: CommandItem[] = [];
  commandActiveIndex = 0;

  private readonly subscriptions = new Subscription();
  private countersRequest?: Subscription;
  private countersLoading = false;
  private countersQueued = false;
  private lastCountersLoadedAt = 0;
  private commandIndexRequest?: Subscription;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly analytics: AnalyticsService,
    private readonly autoRefresh: AutoRefreshService,
    private readonly realtime: RealtimeService,
    private readonly firePositions: FirePositionsService,
    private readonly serviceOrders: ServiceOrdersService,
    private readonly weaponSystems: WeaponSystemsService,
    private readonly depots: DepotsService,
    private readonly eventFeed: EventFeedService,
    private readonly operationalNotifications: OperationalNotificationsService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get sidebarStateLabel(): string {
    return this.sidebarCollapsed ? 'Розгорнути меню' : 'Згорнути меню';
  }

  get realtimeStatusLabel(): string {
    return this.realtimeConnected ? 'Realtime Online' : 'Realtime Offline';
  }

  get realtimeStatusText(): string {
    if (!this.realtimeConnected) {
      return 'Звʼязок втрачено';
    }

    if (!this.realtimeLastEventAt) {
      return 'Підключено - очікування подій';
    }

    return `Остання подія - ${this.formatRealtimeTime(this.realtimeLastEventAt)}`;
  }

  get isAdmin(): boolean {
    return this.auth.hasRole('admin');
  }

  get canManageData(): boolean {
    const role = this.currentUser?.role;
    return role === 'admin' || (role === 'operator' && this.currentUser?.scope !== 'ew');
  }

  get isEwOperator(): boolean {
    return this.currentUser?.scope === 'ew';
  }

  get currentUser() {
    return this.auth.getUser();
  }

  get filteredCommandItems(): CommandItem[] {
    const query = this.commandQuery.trim().toLowerCase();

    if (!query) {
      return this.commandItems.slice(0, 10);
    }

    return this.commandItems.filter((item) => item.keywords.includes(query)).slice(0, 12);
  }

  ngOnInit(): void {
    this.isLoginPage = this.router.url.startsWith('/login');
    this.auth.syncCurrentUser();
    setTimeout(() => this.updateRealtimeConnection(this.realtime.connected$.value));

    if (this.auth.isLoggedIn() && !this.isLoginPage) {
      setTimeout(() => this.loadOperatorCounters());
    }

    this.subscriptions.add(
      this.auth.currentUser$.subscribe((user) => {
        this.resetSessionScopedState();

        if (user && !this.isLoginPage) {
          setTimeout(() => {
            this.eventFeed.load();
            this.loadOperationalNotificationCount();
            this.loadOperatorCounters(true);
          });
        }
      }),
    );

    this.subscriptions.add(
      this.router.events.subscribe((event) => {
        if (!(event instanceof NavigationEnd)) {
          return;
        }

        this.isLoginPage = event.urlAfterRedirects.startsWith('/login');
        this.closeCommandBar();
        this.scrollContentToTop();

        if (this.auth.isLoggedIn() && !this.isLoginPage) {
          this.loadOperationalNotificationCount();
          setTimeout(() => this.loadOperatorCounters());
        }
      }),
    );

    this.subscriptions.add(
      this.realtime.connected$.subscribe((connected) => {
        setTimeout(() => {
          this.updateRealtimeConnection(connected);
          this.cdr.detectChanges();
        });
      }),
    );

    this.subscriptions.add(
      this.autoRefresh.watch(
        ['missions', 'threats'],
        () => {
          if (this.auth.isLoggedIn() && !this.isLoginPage) {
            this.loadOperatorCounters();
          }
        },
      ),
    );

    this.subscriptions.add(
      this.realtime.onAnyChanged((eventName, payload) => {
        this.trackRealtimeEvent(eventName, payload);
        if (
          payload?.entity === 'operational_notification' ||
          (payload?.entity === 'system' && payload?.reason === 'reconnect')
        ) {
          this.loadOperationalNotificationCount();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.countersRequest?.unsubscribe();
    this.commandIndexRequest?.unsubscribe();
  }

  logout(): void {
    this.resetSessionScopedState();
    this.auth.logout();
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleGroup(group: NavGroup): void {
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
      this.openedGroups[group] = true;
      return;
    }

    this.openedGroups[group] = !this.openedGroups[group];
  }

  isGroupOpen(group: NavGroup): boolean {
    return this.openedGroups[group];
  }

  @HostListener('document:keydown', ['$event'])
  handleGlobalShortcut(event: KeyboardEvent): void {
    if (this.isLoginPage || !this.auth.isLoggedIn()) {
      return;
    }

    const isCommandShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';

    if (isCommandShortcut) {
      event.preventDefault();
      this.openCommandBar();
      return;
    }

    if (!this.commandOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeCommandBar();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveCommandSelection(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveCommandSelection(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = this.filteredCommandItems[this.commandActiveIndex];
      if (selected) {
        this.runCommand(selected);
      }
    }
  }

  openCommandBar(): void {
    this.commandOpen = true;
    this.commandQuery = '';
    this.commandActiveIndex = 0;
    this.ensureCommandItemsLoaded();
  }

  closeCommandBar(): void {
    this.commandOpen = false;
    this.commandQuery = '';
    this.commandActiveIndex = 0;
  }

  onCommandQueryChange(): void {
    this.commandActiveIndex = 0;
  }

  moveCommandSelection(direction: number): void {
    const total = this.filteredCommandItems.length;

    if (total === 0) {
      this.commandActiveIndex = 0;
      return;
    }

    this.commandActiveIndex = (this.commandActiveIndex + direction + total) % total;
  }

  runCommand(item: CommandItem): void {
    void this.router.navigateByUrl(item.route);
    this.closeCommandBar();
  }

  getCommandIcon(item: CommandItem): string {
    switch (item.entity) {
      case 'firePosition':
        return 'ВП';
      case 'serviceOrder':
        return 'ВГЗ';
      case 'weaponSystem':
        return 'СГ';
      case 'depot':
        return 'БК';
      default:
        return '>';
    }
  }

  private ensureCommandItemsLoaded(): void {
    if (this.commandItems.length > 0 || this.commandLoading) {
      return;
    }

    this.commandLoading = true;
    this.commandIndexRequest?.unsubscribe();

    this.commandIndexRequest = forkJoin({
      firePositions: this.firePositions.getAll().pipe(catchError(() => of([]))),
      serviceOrders: this.serviceOrders.getAll().pipe(catchError(() => of([]))),
      weaponSystems: this.weaponSystems.getAll().pipe(catchError(() => of([]))),
      depots: this.depots.getAll().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ firePositions, serviceOrders, weaponSystems, depots }) => {
        const staticItems: CommandItem[] = [
          this.createCommandItem('page-home', 'Головна', 'Оперативна обстановка', '/home', 'page'),
          this.createCommandItem('page-map', 'Карта', 'Карта обстановки', '/map', 'page'),
          this.createCommandItem(
            'page-notifications',
            'Центр повідомлень',
            'Події, увага, інформація, журнал',
            '/notifications',
            'page',
          ),
          this.createCommandItem(
            'page-service-orders',
            'ВГЗ',
            'Вогневі завдання',
            '/service-orders',
            'page',
          ),
          this.createCommandItem(
            'page-fire-positions',
            'ВП',
            'Вогневі позиції',
            '/fire-positions',
            'page',
          ),
          this.createCommandItem(
            'page-weapon-systems',
            'СГ',
            'Озброєння',
            '/weapon-systems',
            'page',
          ),
          this.createCommandItem(
            'page-ew',
            'РЕБ',
            'Аеророзвідка, пости РЕБ, станції РЕБ',
            '/ew',
            'page',
          ),
          this.createCommandItem(
            'page-air-assets',
            'Повітряні засоби',
            'Розрахунки БпЛА, екіпажі та повітряні засоби',
            '/air-assets',
            'page',
          ),
          this.createCommandItem(
            'page-stock',
            'Залишки БК',
            'Склади та боєкомплект',
            '/stock',
            'page',
          ),
          this.createCommandItem(
            'page-analytics',
            'Аналітика',
            'Готовність, витрати, ефективність',
            '/analytics',
            'page',
          ),
        ];

        this.commandItems = [
          ...staticItems,
          ...firePositions.map((position) =>
            this.createCommandItem(
              `fp-${position.id}`,
              position.name || 'Вогнева позиція',
              [
                position.unit?.name,
                position.mgrs || this.formatCommandCoords(position.lat, position.lng),
              ]
                .filter(Boolean)
                .join(' - '),
              '/fire-positions',
              'firePosition',
            ),
          ),
          ...serviceOrders.map((order) =>
            this.createCommandItem(
              `vgz-${order.id}`,
              `ВГЗ ${order.orderNumber || order.id}`,
              [order.status, order.targetSettlement, order.targetMgrs].filter(Boolean).join(' - '),
              '/service-orders',
              'serviceOrder',
            ),
          ),
          ...weaponSystems.map((weapon) =>
            this.createCommandItem(
              `sg-${weapon.id}`,
              weapon.callsign || weapon.serialNumber || weapon.weaponModel?.name || 'СГ',
              [weapon.weaponModel?.name, weapon.readinessStatus, weapon.firePosition?.name]
                .filter(Boolean)
                .join(' - '),
              '/weapon-systems',
              'weaponSystem',
            ),
          ),
          ...depots.map((depot) =>
            this.createCommandItem(
              `depot-${depot.id}`,
              depot.name || 'Склад',
              [depot.depotType, depot.unit?.name, depot.mgrs].filter(Boolean).join(' - '),
              '/depots',
              'depot',
            ),
          ),
        ];
      },
      error: () => {
        this.commandItems = [];
      },
      complete: () => {
        this.commandLoading = false;
      },
    });
  }

  private createCommandItem(
    id: string,
    title: string,
    subtitle: string,
    route: string,
    entity: CommandEntity,
  ): CommandItem {
    const normalized = `${title} ${subtitle} ${route}`.toLowerCase();

    return {
      id,
      title,
      subtitle,
      route,
      entity,
      keywords: normalized,
    };
  }

  private formatCommandCoords(
    lat: number | null | undefined,
    lng: number | null | undefined,
  ): string {
    if (lat == null || lng == null) {
      return '';
    }

    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  private scrollContentToTop(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.querySelector('.core2-main')?.scrollTo({ top: 0, left: 0 });
  }

  private trackRealtimeEvent(eventName: RealtimeEventName, payload?: RealtimePayload): void {
    this.realtimeEventsCount += 1;
    this.realtimeLastEventAt = new Date();
    this.realtimeUpdatedAt = this.realtimeLastEventAt;
    this.realtimeLastEventLabel = this.getRealtimeEventLabel(eventName, payload);
  }

  private updateRealtimeConnection(connected: boolean): void {
    this.realtimeConnected = connected;
    this.realtimeUpdatedAt = new Date();

    if (!connected) {
      this.realtimeLastEventLabel = 'Звʼязок втрачено';
      return;
    }

    if (!this.realtimeLastEventAt) {
      this.realtimeLastEventLabel = 'Підключено';
    }
  }

  private loadOperationalNotificationCount(): void {
    if (!this.auth.isLoggedIn() || this.isLoginPage) {
      this.operationalUnreadCount = 0;
      return;
    }

    this.operationalNotifications.getCount().subscribe({
      next: (counter) => {
        this.operationalUnreadCount = counter.unread;
      },
      error: () => {
        this.operationalUnreadCount = 0;
      },
    });
  }

  private getRealtimeEventLabel(eventName: RealtimeEventName, payload?: RealtimePayload): string {
    const entity =
      typeof payload?.entity === 'string' && payload.entity.trim() ? ` - ${payload.entity}` : '';

    switch (eventName) {
      case 'fire_mission_changed':
        return `ВГЗ оновлено${entity}`;
      case 'service_order_changed':
        return `Вогневе завдання оновлено${entity}`;
      case 'map_changed':
        return `Карта оновлена${entity}`;
      case 'stock_changed':
        return `БК оновлено${entity}`;
      case 'event_created':
        return `Нова подія${entity}`;
      case 'analytics_changed':
        return `Аналітика оновлена${entity}`;
      case 'threat_changed':
        return `Повітряна загроза оновлена${entity}`;
      case 'reference_changed':
        return `Довідники оновлено${entity}`;
      case 'user_changed':
        return `Користувачі оновлено${entity}`;
      case 'settings_changed':
        return `Налаштування оновлено${entity}`;
      case 'all_changed':
        return `Повна синхронізація${entity}`;
      default:
        return `Синхронізація${entity}`;
    }
  }

  private formatRealtimeTime(value: Date): string {
    return value.toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private loadOperatorCounters(force = false): void {
    const now = Date.now();

    if (!force && now - this.lastCountersLoadedAt < 5000) {
      return;
    }

    if (this.countersLoading) {
      this.countersQueued = true;
      return;
    }

    this.countersLoading = true;
    this.countersRequest?.unsubscribe();

    this.countersRequest = this.analytics.getOperatorCounters().subscribe({
      next: (counters) => {
        this.actionOrdersCount = Number(counters.actionOrdersCount || 0);
        this.activeThreatsCount = Number(counters.activeThreatsCount || 0);
        this.lastCountersLoadedAt = Date.now();
      },
      error: () => {
        this.actionOrdersCount = 0;
        this.activeThreatsCount = 0;
        this.lastCountersLoadedAt = Date.now();
      },
      complete: () => {
        this.countersLoading = false;

        if (this.countersQueued) {
          this.countersQueued = false;
          queueMicrotask(() => this.loadOperatorCounters(true));
        }
      },
    });
  }

  private resetSessionScopedState(): void {
    this.countersRequest?.unsubscribe();
    this.countersLoading = false;
    this.countersQueued = false;
    this.lastCountersLoadedAt = 0;
    this.actionOrdersCount = 0;
    this.activeThreatsCount = 0;
    this.commandIndexRequest?.unsubscribe();
    this.commandLoading = false;
    this.commandItems = [];
    this.eventFeed.reset();
  }
}
