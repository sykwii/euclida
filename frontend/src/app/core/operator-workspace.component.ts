import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AirThreat } from '../features/air-threats/air-threat.model';
import { AirThreatsService } from '../features/air-threats/air-threats.service';
import { AuthService } from '../features/auth/auth.service';
import { ServiceOrder } from '../features/service-orders/service-order.model';
import { ServiceOrdersService } from '../features/service-orders/service-orders.service';
import { StockService } from '../features/stock/stock.service';
import { EventLog } from '../features/event-logs/event-logs.service';
import { EventFeedService } from './event-feed.service';
import { RealtimeService } from './realtime.service';
import { ToastService } from './toast.service';
import { formatKyivDateTime, formatKyivShortDateTime, isSameKyivDate, minutesSince } from './kyiv-time.util';
import { OperatorShiftState, ShiftService } from './shift.service';

interface OperatorAction {
  id: string;
  title: string;
  details: string;
  priority: number;
  tone: 'danger' | 'warning' | 'info' | 'success';
  route: string;
  queryParams?: Record<string, string | number | boolean>;
}

@Component({
  selector: 'app-operator-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="operator-workspace" *ngIf="canSeeWorkspace" [class.open]="open" [class.compact]="importantOnly">
      <button type="button" class="operator-toggle" (click)="toggle()">
        <span>Оператор</span>
        <strong>{{ actionQueue.length }}</strong>
      </button>

      <section class="operator-panel" *ngIf="open">
        <header>
          <div>
            <span>Робоча зміна</span>
            <h2>Центр дій</h2>
          </div>

          <button type="button" class="icon-button" (click)="open = false">×</button>
        </header>

        <div class="operator-toolbar">
          <button type="button" [class.active]="importantOnly" (click)="toggleImportantOnly()">
            Тільки важливе
          </button>

          <button type="button" (click)="refresh()">Оновити</button>
        </div>

        <label class="command-search">
          <span>Пошук / команда</span>
          <input
            #searchInput
            name="operatorSearch"
            [(ngModel)]="searchTerm"
            placeholder="Номер, район, ВП, склад, координати..."
          />
        </label>

        <div class="preset-grid">
          <button type="button" (click)="applyPreset('shift')">Зміна</button>
          <button type="button" (click)="applyPreset('problems')">Проблеми</button>
          <button type="button" (click)="applyPreset('map')">Мапа + активні</button>
          <button type="button" (click)="applyPreset('logistics')">Логістика</button>
        </div>

        <section class="operator-section">
          <div class="section-head">
            <h3>Потрібна дія</h3>
            <span>{{ actionQueue.length }}</span>
          </div>

          <button
            type="button"
            class="action-item"
            *ngFor="let action of visibleActions"
            [class]="action.tone"
            (click)="openAction(action)"
          >
            <strong>{{ action.title }}</strong>
            <small>{{ action.details }}</small>
          </button>

          <p class="empty" *ngIf="visibleActions.length === 0">Критичних дій немає.</p>
        </section>

        <section class="operator-section" *ngIf="searchTerm.trim()">
          <div class="section-head">
            <h3>Знайдено</h3>
            <span>{{ searchResults.length }}</span>
          </div>

          <button
            type="button"
            class="search-result"
            *ngFor="let order of searchResults"
            (click)="openOrder(order)"
          >
            <strong>{{ order.orderNumber }}</strong>
            <small>{{ order.targetSettlement || 'район не вказано' }} · {{ getStatusLabel(order.status) }}</small>
          </button>
        </section>

        <section class="operator-section">
          <div class="section-head">
            <h3>Зміна</h3>
            <span>{{ shiftState.isActive ? 'активна' : 'немає' }}</span>
          </div>

          <div class="shift-controls">
            <button type="button" [disabled]="shiftState.loading || shiftState.isActive" (click)="startShift()">Почати зміну</button>
            <button type="button" [disabled]="shiftState.loading || !shiftState.isActive" (click)="endShift()">Завершити зміну</button>
          </div>

          <p class="empty" *ngIf="shiftState.startedAt">Початок: {{ formatKyivDateTime(shiftState.startedAt) }}</p>
          <p class="empty" *ngIf="shiftState.endedAt">Завершення: {{ formatKyivDateTime(shiftState.endedAt) }}</p>
          <p class="empty danger-text" *ngIf="shiftState.error">{{ shiftState.error }}</p>
        </section>

        <section class="operator-section task-control-section">
          <div class="section-head">
            <h3>Контроль завдань</h3>
            <span>{{ operatorTaskIssues.length }}</span>
          </div>

          <div class="task-control-grid">
            <button type="button" class="task-control-card danger" (click)="openTaskFilter('overdue')">
              <strong>{{ overdueOrders.length }}</strong>
              <span>прострочено</span>
            </button>
            <button type="button" class="task-control-card warning" (click)="openTaskFilter('today')">
              <strong>{{ todayOrders.length }}</strong>
              <span>сьогодні</span>
            </button>
            <button type="button" class="task-control-card warning" (click)="openTaskFilter('no_assignee')">
              <strong>{{ ordersWithoutAssignee.length }}</strong>
              <span>без виконавця</span>
            </button>
            <button type="button" class="task-control-card info" (click)="openTaskFilter('long_progress')">
              <strong>{{ longInProgressOrders.length }}</strong>
              <span>довго в роботі</span>
            </button>
          </div>

          <button
            type="button"
            class="action-item"
            *ngFor="let issue of visibleOperatorTaskIssues"
            [class]="issue.tone"
            (click)="openAction(issue)"
          >
            <strong>{{ issue.title }}</strong>
            <small>{{ issue.details }}</small>
          </button>

          <p class="empty" *ngIf="visibleOperatorTaskIssues.length === 0">Критичних проблем із завданнями немає.</p>
        </section>

        <section class="operator-section">
          <div class="section-head">
            <h3>Зміни за зміну</h3>
            <span>{{ eventFeed.snapshot.length }}</span>
          </div>

          <div class="shift-summary">
            <div><strong>{{ ordersCreated }}</strong><span>нових</span></div>
            <div><strong>{{ sentCount }}</strong><span>передано</span></div>
            <div><strong>{{ rejectedCount }}</strong><span>відхилено</span></div>
            <div><strong>{{ activeThreats.length }}</strong><span>загроз</span></div>
          </div>
        </section>
        <section class="operator-section event-log-section">
          <div class="section-head">
            <h3>Стрічка подій</h3>
            <span>{{ filteredEventLogs.length }}</span>
          </div>

          <div class="event-filters">
            <select name="eventTypeFilter" [(ngModel)]="eventTypeFilter">
              <option value="all">Усі типи</option>
              <option value="operator_shift">Зміни</option>
              <option value="service_order">Задачи / приказы</option>
              <option value="weapon">Средства</option>
              <option value="stock">Логистика</option>
              <option value="fire_position">ВП</option>
            </select>

            <select name="eventActionFilter" [(ngModel)]="eventActionFilter">
              <option value="all">Все действия</option>
              <option value="created">Создано</option>
              <option value="updated">Изменено</option>
              <option value="started">Начато</option>
              <option value="completed">Завершено</option>
              <option value="sent">Передано</option>
              <option value="accepted">Принято</option>
              <option value="rejected">Отклонено</option>
              <option value="cancelled">Отменено</option>
            </select>

            <input
              name="eventSearchTerm"
              [(ngModel)]="eventSearchTerm"
              placeholder="Поиск в журнале..."
            />
          </div>

          <button
            type="button"
            class="event-row"
            *ngFor="let event of visibleEventLogs"
            [ngClass]="getEventTone(event.action)"
            (click)="openEventLog(event)"
          >
            <strong>{{ event.title }}</strong>
            <small>{{ formatKyivShortDateTime(event.createdAt) }} · {{ event.actorName || event.actorLogin || 'система' }} · {{ getEventTypeLabel(event.eventType) }}</small>
            <span *ngIf="event.details">{{ event.details }}</span>
          </button>

          <p class="empty" *ngIf="visibleEventLogs.length === 0">Событий по фильтру нет.</p>
        </section>


        <section class="operator-section hints">
          <div class="section-head">
            <h3>Підказки</h3>
          </div>

          <p *ngFor="let hint of operatorHints">{{ hint }}</p>
        </section>

        <footer>
          <span>/ пошук</span>
          <span>M / Ь мапа</span>
          <span>N / Т нова</span>
          <span>R / К оновити</span>
          <span>Esc закрити</span>
        </footer>
      </section>
    </aside>
  `,
  styles: [`
    .operator-workspace {
      position: fixed;
      left: 96px;
      bottom: 18px;
      z-index: var(--z-notifications);
      pointer-events: none;
    }

    .operator-toggle,
    .operator-panel {
      pointer-events: auto;
    }

    .operator-toggle {
      min-width: 128px;
      display: inline-flex;
      justify-content: space-between;
      gap: 12px;
      background: rgba(10, 15, 21, 0.9);
      backdrop-filter: blur(16px);
      box-shadow: var(--shadow-soft), var(--surface-glow);
    }

    .operator-toggle strong {
      min-width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 7px;
      background: rgba(246, 183, 60, 0.18);
      color: #ffe6ad;
      font-size: 12px;
    }

    .operator-panel {
      width: min(440px, calc(100vw - 32px));
      max-height: min(720px, calc(100dvh - 42px));
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 10px;
      padding: 12px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: rgba(10, 15, 21, 0.98);
      box-shadow: var(--shadow), var(--surface-glow);
      backdrop-filter: blur(18px);
    }

    header,
    .section-head,
    footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    header span {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
    }

    h2,
    h3 {
      margin: 0;
    }

    h2 {
      font-size: 18px;
    }

    h3 {
      font-size: 14px;
    }

    .icon-button {
      width: 34px;
      height: 34px;
      padding: 0;
    }

    .operator-toolbar,
    .preset-grid,
    .shift-summary,
    .shift-controls,
    .task-control-grid {
      display: grid;
      gap: 8px;
    }

    .operator-toolbar {
      grid-template-columns: 1fr auto;
    }

    .shift-controls,
    .task-control-grid {
      grid-template-columns: 1fr 1fr;
    }

    .task-control-card {
      display: grid;
      gap: 2px;
      padding: 9px;
      text-align: left;
    }

    .task-control-card strong,
    .task-control-card span {
      display: block;
    }

    .task-control-card strong {
      font-size: 18px;
    }

    .task-control-card span {
      color: var(--muted);
      font-size: 11px;
    }

    .task-control-card.danger {
      border-color: rgba(239, 68, 68, 0.38);
      background: rgba(239, 68, 68, 0.1);
    }

    .task-control-card.warning {
      border-color: rgba(246, 183, 60, 0.38);
      background: rgba(246, 183, 60, 0.1);
    }

    .task-control-card.info {
      border-color: rgba(87, 199, 255, 0.32);
      background: rgba(87, 199, 255, 0.08);
    }

    .shift-controls button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .operator-toolbar button.active {
      border-color: rgba(246, 183, 60, 0.5);
      background: rgba(246, 183, 60, 0.14);
      color: #ffe6ad;
    }

    .command-search {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
    }

    .command-search input {
      width: 100%;
    }

    .preset-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .preset-grid button {
      min-height: 36px;
      padding: 8px;
      white-space: nowrap;
    }

    .operator-section {
      min-height: 0;
      display: grid;
      gap: 8px;
    }

    .section-head span {
      min-width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.06);
      color: #e5e7eb;
      font-size: 12px;
    }

    .action-item,
    .search-result,
    .event-row {
      width: 100%;
      display: grid;
      gap: 5px;
      padding: 10px;
      text-align: left;
      background: rgba(255, 255, 255, 0.04);
    }

    .action-item strong,
    .search-result strong,
    .event-row strong {
      overflow-wrap: anywhere;
    }

    .action-item small,
    .search-result small,
    .event-row small,
    .event-row span,
    .empty,
    .hints p,
    footer {
      color: var(--muted);
      font-size: 12px;
    }

    .action-item.danger {
      border-color: rgba(239, 68, 68, 0.38);
      background: rgba(239, 68, 68, 0.1);
    }

    .action-item.warning {
      border-color: rgba(246, 183, 60, 0.38);
      background: rgba(246, 183, 60, 0.1);
    }

    .action-item.info {
      border-color: rgba(87, 199, 255, 0.32);
      background: rgba(87, 199, 255, 0.08);
    }

    .action-item.success,
    .event-row.success {
      border-color: rgba(34, 197, 94, 0.32);
      background: rgba(34, 197, 94, 0.08);
    }

    .event-row.warning {
      border-color: rgba(246, 183, 60, 0.32);
      background: rgba(246, 183, 60, 0.08);
    }

    .event-row.danger {
      border-color: rgba(239, 68, 68, 0.32);
      background: rgba(239, 68, 68, 0.08);
    }

    .event-row.info {
      border-color: rgba(87, 199, 255, 0.28);
      background: rgba(87, 199, 255, 0.06);
    }

    .event-filters {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .event-filters input {
      grid-column: 1 / -1;
    }

    .shift-summary {
      grid-template-columns: repeat(4, 1fr);
    }

    .shift-summary div {
      padding: 9px;
      border: 1px solid rgba(185, 199, 214, 0.1);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.035);
      text-align: center;
    }

    .shift-summary strong,
    .shift-summary span {
      display: block;
    }

    .shift-summary strong {
      color: #fff;
      font-size: 18px;
    }

    .shift-summary span {
      margin-top: 2px;
      color: var(--muted);
      font-size: 11px;
    }

    .hints p {
      margin: 0;
      padding: 8px 10px;
      border-left: 3px solid rgba(46, 230, 214, 0.5);
      background: rgba(46, 230, 214, 0.055);
      border-radius: 8px;
    }

    footer {
      flex-wrap: wrap;
      justify-content: flex-start;
      border-top: 1px solid var(--border);
      padding-top: 10px;
    }

    @media (max-width: 980px) {
      .operator-workspace {
        left: 10px;
        right: auto;
        bottom: calc(68px + env(safe-area-inset-bottom));
      }

      .preset-grid,
      .shift-summary {
        grid-template-columns: repeat(2, 1fr);
      }

      .operator-toggle {
        min-width: 54px;
        width: 54px;
        height: 54px;
        justify-content: center;
        border-radius: 16px;
        padding: 0;
      }

      .operator-toggle span {
        display: none;
      }

      .operator-panel {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-height: min(78dvh, 720px);
        margin: 0;
        border-radius: 18px 18px 0 0;
        padding: 14px;
        padding-bottom: calc(18px + env(safe-area-inset-bottom));
      }

      .operator-toolbar,
      .event-filters {
        grid-template-columns: 1fr;
      }

      .preset-grid,
      .shift-controls,
      .task-control-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 560px) {
      .operator-panel {
        max-height: 86dvh;
      }

      header,
      .section-head {
        align-items: flex-start;
      }

      .preset-grid,
      .shift-controls,
      .task-control-grid,
      .shift-summary {
        grid-template-columns: 1fr;
      }

      footer {
        display: none;
      }
    }
  `],
})
export class OperatorWorkspaceComponent implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  open = false;
  importantOnly = false;
  searchTerm = '';
  eventSearchTerm = '';
  eventTypeFilter = 'all';
  eventActionFilter = 'all';
  orders: ServiceOrder[] = [];
  activeThreats: AirThreat[] = [];
  lowStockDepots = 0;
  shiftState: OperatorShiftState = { id: null, isActive: false, startedAt: null, endedAt: null, operatorName: null, loading: false, error: null };

  private readonly subscriptions = new Subscription();
  private lastCriticalNotificationKey = '';

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly auth: AuthService,
    private readonly ordersService: ServiceOrdersService,
    private readonly airThreatsService: AirThreatsService,
    private readonly stockService: StockService,
    private readonly realtime: RealtimeService,
    private readonly router: Router,
    private readonly toast: ToastService,
    readonly eventFeed: EventFeedService,
    readonly shiftService: ShiftService,
  ) {}

  ngOnInit(): void {
    if (!this.isBrowser()) {
      return;
    }

    if (!this.auth.isLoggedIn()) {
      return;
    }

    this.importantOnly =
      localStorage.getItem('euclida_operator_important_only') === 'true';

    this.subscriptions.add(
      this.shiftService.state$.subscribe((state) => {
        this.shiftState = state;
      }),
    );

    this.refresh();

    this.realtime.onServiceOrdersChanged(() => this.refreshOrders());
    this.realtime.onMapChanged(() => {
      this.refreshOrders();
      this.refreshThreats();
    });
    this.realtime.onStockChanged(() => this.refreshStock());
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get canSeeWorkspace(): boolean {
    const user = this.auth.getUser();

    return !!user && user.role !== 'observer';
  }

  @HostListener('document:keydown', ['$event'])
  handleHotkeys(event: KeyboardEvent): void {
    if (!this.isBrowser()) {
      return;
    }

    if (!this.auth.isLoggedIn()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const isTyping =
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.tagName === 'SELECT';

    if (event.key === 'Escape') {
      this.open = false;
      return;
    }

    if (isTyping) {
      return;
    }

    const key = event.key.toLowerCase();

    if (event.code === 'Slash' || key === '/' || key === '.' || key === ',') {
      event.preventDefault();
      this.open = true;
      setTimeout(() => this.searchInput?.nativeElement.focus());
      return;
    }

    if (event.code === 'KeyM' || key === 'm' || key === 'ь') {
      void this.router.navigate(['/map'], { queryParams: { preset: 'active' } });
      return;
    }

    if (event.code === 'KeyN' || key === 'n' || key === 'т') {
      void this.router.navigate(['/service-orders'], {
        queryParams: { create: 'true' },
      });
      return;
    }

    if (event.code === 'KeyR' || key === 'r' || key === 'к') {
      this.refresh();
    }
  }

  toggle(): void {
    if (!this.canSeeWorkspace) {
      return;
    }

    this.open = !this.open;
  }

  toggleImportantOnly(): void {
    if (!this.isBrowser()) {
      return;
    }

    this.importantOnly = !this.importantOnly;

    localStorage.setItem(
      'euclida_operator_important_only',
      String(this.importantOnly),
    );

    if (this.importantOnly) {
      void this.router.navigate(['/service-orders'], {
        queryParams: { filter: 'needs_action', view: 'cards' },
      });
    }
  }

  refresh(): void {
    if (!this.auth.isLoggedIn()) {
      return;
    }

    this.refreshOrders();
    this.refreshThreats();
    this.refreshStock();
    this.eventFeed.load();
  }

  startShift(): void {
    this.shiftService.startShift();
  }

  endShift(): void {
    this.shiftService.endShift();
  }

  applyPreset(preset: 'shift' | 'problems' | 'map' | 'logistics'): void {
    if (!this.isBrowser()) {
      return;
    }

    if (preset === 'shift') {
      this.open = true;
      this.importantOnly = false;
      localStorage.setItem('euclida_operator_important_only', 'false');
      void this.router.navigate(['/service-orders'], { queryParams: { view: 'cards' } });
      return;
    }

    if (preset === 'problems') {
      this.importantOnly = true;
      localStorage.setItem('euclida_operator_important_only', 'true');
      void this.router.navigate(['/service-orders'], {
        queryParams: { filter: 'needs_action', view: 'cards' },
      });
      return;
    }

    if (preset === 'map') {
      void this.router.navigate(['/map'], { queryParams: { preset: 'active' } });
      return;
    }

    void this.router.navigate(['/stock'], { queryParams: { mode: 'logistics' } });
  }

  openAction(action: OperatorAction): void {
    void this.router.navigate([action.route], { queryParams: action.queryParams });
  }

  openTaskFilter(filter: 'overdue' | 'today' | 'no_assignee' | 'long_progress'): void {
    void this.router.navigate(['/service-orders'], {
      queryParams: { filter, view: 'cards' },
    });
  }

  openOrder(order: ServiceOrder): void {
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

  get actionQueue(): OperatorAction[] {
    return this.orders
      .filter((order) => !this.isTerminalOrder(order))
      .flatMap((order) => this.getOrderActions(order))
      .sort((a, b) => b.priority - a.priority);
  }

  get visibleActions(): OperatorAction[] {
    return this.actionQueue.slice(0, this.importantOnly ? 6 : 10);
  }

  get overdueOrders(): ServiceOrder[] {
    return this.orders.filter((order) => this.isOrderOverdue(order));
  }

  get todayOrders(): ServiceOrder[] {
    return this.orders.filter((order) => !this.isTerminalOrder(order) && isSameKyivDate(order.createdAt));
  }

  get ordersWithoutAssignee(): ServiceOrder[] {
    return this.orders.filter((order) => !this.isTerminalOrder(order) && !order.assignedUnitId);
  }

  get longInProgressOrders(): ServiceOrder[] {
    return this.orders.filter((order) => order.status === 'in_progress' && this.minutesSince(order.startedAt || order.updatedAt) >= 120);
  }

  get operatorTaskIssues(): OperatorAction[] {
    return [
      ...this.overdueOrders.map((order) => this.toTaskIssue(order, 'overdue')),
      ...this.ordersWithoutAssignee.map((order) => this.toTaskIssue(order, 'no_assignee')),
      ...this.longInProgressOrders.map((order) => this.toTaskIssue(order, 'long_progress')),
    ].sort((a, b) => b.priority - a.priority);
  }

  get visibleOperatorTaskIssues(): OperatorAction[] {
    return this.operatorTaskIssues.slice(0, this.importantOnly ? 4 : 6);
  }

  get searchResults(): ServiceOrder[] {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      return [];
    }

    return this.orders
      .filter((order) =>
        [
          order.orderNumber,
          order.targetSettlement,
          order.targetMgrs,
          order.selectedFirePosition?.name,
          order.selectedFirePosition?.unit?.name,
          `${order.targetLat}`,
          `${order.targetLng}`,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 8);
  }


  get filteredEventLogs(): EventLog[] {
    const term = this.eventSearchTerm.trim().toLowerCase();

    return this.eventFeed.snapshot.filter((event) => {
      const matchesType = this.eventTypeFilter === 'all' || event.eventType === this.eventTypeFilter;
      const matchesAction = this.eventActionFilter === 'all' || event.action === this.eventActionFilter;

      if (!matchesType || !matchesAction) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [
        event.title,
        event.details,
        event.actorName,
        event.actorLogin,
        event.unitName,
        event.entityName,
        event.eventType,
        event.action,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }

  get visibleEventLogs(): EventLog[] {
    return this.filteredEventLogs.slice(0, this.importantOnly ? 8 : 14);
  }

  get ordersCreated(): number {
    return this.orders.filter(
      (order) => new Date(order.createdAt) >= this.shiftService.shiftStartedAt,
    ).length;
  }

  get sentCount(): number {
    return this.orders.filter((order) =>
      ['sent', 'sent_to_division', 'sent_to_battery'].includes(order.status),
    ).length;
  }

  get rejectedCount(): number {
    return this.orders.filter((order) => order.status === 'rejected').length;
  }

  get operatorHints(): string[] {
    const hints: string[] = [];
    const oldest = this.orders
      .filter((order) => !this.isTerminalOrder(order))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

    if (oldest) {
      hints.push(
        `Найдовше без закриття: ${oldest.orderNumber}, ${this.minutesSince(oldest.createdAt)} хв.`,
      );
    }

    const withoutPosition = this.orders.filter(
      (order) =>
        order.status !== 'completed' &&
        order.status !== 'cancelled' &&
        !order.selectedFirePosition,
    ).length;

    if (withoutPosition > 0) {
      hints.push(`${withoutPosition} завдань без ВП: краще почати з них.`);
    }

    if (this.activeThreats.length > 0) {
      hints.push(`Активні загрози: ${this.activeThreats.length}. Перевір мапу перед вибором ВП.`);
    }

    if (hints.length === 0) {
      hints.push('Стан спокійний: критичних підказок немає.');
    }

    return hints.slice(0, 3);
  }

  formatKyivDateTime(value: string | Date | null | undefined): string {
    return formatKyivDateTime(value);
  }

  formatKyivShortDateTime(value: string | Date | null | undefined): string {
    return formatKyivShortDateTime(value);
  }

  getStatusLabel(status: string): string {
    if (status === 'draft') return 'чернетка';
    if (status === 'proposed') return 'є пропозиції';
    if (status === 'sent') return 'передано на ВП';
    if (status === 'sent_to_division') return 'передано ПУВД';
    if (status === 'sent_to_battery') return 'передано ПУВБ';
    if (status === 'accepted') return 'прийнято';
    if (status === 'rejected') return 'відхилено';
    if (status === 'in_progress') return 'в роботі';
    if (status === 'completed') return 'закрито';
    if (status === 'cancelled') return 'скасовано';

    return status;
  }


  getEventTypeLabel(type: string): string {
    if (type === 'operator_shift') return 'зміна';
    if (type === 'service_order') return 'завдання';
    if (type === 'weapon') return 'засіб';
    if (type === 'fire_position') return 'ВП';
    if (type === 'stock') return 'логистика';

    return type;
  }

  getEventTone(action: string): 'success' | 'warning' | 'danger' | 'info' {
    if (['created', 'accepted', 'completed'].includes(action)) return 'success';
    if (['updated', 'started', 'sent', 'moved'].includes(action)) return 'warning';
    if (['deleted', 'rejected', 'cancelled'].includes(action)) return 'danger';

    return 'info';
  }

  openEventLog(event: EventLog): void {
    if (event.eventType === 'operator_shift') return;

    if (event.eventType === 'service_order') {
      void this.router.navigate(['/service-orders'], {
        queryParams: { orderId: event.entityId || '', view: 'cards' },
      });
      return;
    }

    if (event.eventType === 'weapon') {
      void this.router.navigate(['/weapon-systems'], {
        queryParams: { entityId: event.entityId || '' },
      });
      return;
    }

    if (event.eventType === 'fire_position') {
      void this.router.navigate(['/fire-positions'], {
        queryParams: { entityId: event.entityId || '' },
      });
      return;
    }

    if (event.eventType === 'stock') {
      void this.router.navigate(['/stock'], { queryParams: { mode: 'logistics' } });
    }
  }

  private refreshOrders(): void {
    if (!this.auth.isLoggedIn()) {
      return;
    }

    this.ordersService.getAll().subscribe({
      next: (orders) => {
        this.orders = orders;
        this.notifyCriticalTaskChanges();
      },
      error: () => undefined,
    });
  }

  private refreshThreats(): void {
    if (!this.auth.isLoggedIn()) {
      return;
    }

    this.airThreatsService.getAll().subscribe({
      next: (threats) => {
        this.activeThreats = threats.filter((threat) => threat.isActive);
      },
      error: () => undefined,
    });
  }

  private refreshStock(): void {
    if (!this.auth.isLoggedIn()) {
      return;
    }

    this.stockService.getByDepots().subscribe({
      next: (depots) => {
        this.lowStockDepots = depots.filter((depot) => {
          const total = [
            ...depot.shells,
            ...depot.charges,
            ...depot.fuzes,
            ...depot.primers,
          ].reduce((sum, item) => sum + Number(item.quantity || 0), 0);

          return total > 0 && total < 10;
        }).length;
      },
      error: () => undefined,
    });
  }

  private notifyCriticalTaskChanges(): void {
    const overdueCount = this.overdueOrders.length;
    const noAssigneeCount = this.ordersWithoutAssignee.length;
    const longProgressCount = this.longInProgressOrders.length;
    const key = `${overdueCount}:${noAssigneeCount}:${longProgressCount}`;

    if (key === this.lastCriticalNotificationKey) {
      return;
    }

    this.lastCriticalNotificationKey = key;

    if (overdueCount > 0) {
      this.toast.show(`Прострочені завдання: ${overdueCount}. Час розраховано за Києвом.`, 'danger');
      return;
    }

    if (noAssigneeCount > 0) {
      this.toast.show(`Задачи без виконавця: ${noAssigneeCount}.`, 'warning');
      return;
    }

    if (longProgressCount > 0) {
      this.toast.show(`Задачи довго в роботі: ${longProgressCount}.`, 'warning');
    }
  }

  private getOrderActions(order: ServiceOrder): OperatorAction[] {
    const actions: OperatorAction[] = [];
    const baseParams = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      lat: order.targetLat,
      lng: order.targetLng,
      positionId: order.selectedFirePosition?.id || '',
    };

    if (order.status === 'rejected') {
      actions.push({
        id: `${order.id}-rejected`,
        title: `${order.orderNumber}: відхилено`,
        details: order.rejectionReason || 'Потрібно підібрати іншу ВП',
        priority: 100,
        tone: 'danger',
        route: '/service-orders',
        queryParams: { filter: 'rejected', view: 'cards', orderId: order.id },
      });
    }

    if (!order.selectedFirePosition && !this.isTerminalOrder(order)) {
      actions.push({
        id: `${order.id}-no-position`,
        title: `${order.orderNumber}: без ВП`,
        details: `${order.targetSettlement || 'район не вказано'} · ${this.minutesSince(order.createdAt)} хв`,
        priority: 90,
        tone: 'warning',
        route: '/service-orders',
        queryParams: { filter: 'no_position', view: 'cards', orderId: order.id },
      });
    }

    if (order.status === 'proposed') {
      actions.push({
        id: `${order.id}-proposed`,
        title: `${order.orderNumber}: передати на розгляд`,
        details: `ВП: ${order.selectedFirePosition?.name || 'обрано варіант'}`,
        priority: 85,
        tone: 'warning',
        route: '/service-orders',
        queryParams: { filter: 'needs_action', view: 'cards', orderId: order.id },
      });
    }

    if (
      order.status === 'sent' ||
      order.status === 'sent_to_division' ||
      order.status === 'sent_to_battery'
    ) {
      actions.push({
        id: `${order.id}-sent`,
        title: `${order.orderNumber}: очікує рішення`,
        details: `Статус: ${this.getStatusLabel(order.status)} · ВП: ${order.selectedFirePosition?.name || '—'}`,
        priority: 75,
        tone: 'info',
        route: '/service-orders',
        queryParams: { filter: 'needs_action', view: 'cards', orderId: order.id },
      });
    }

    if (order.status === 'accepted') {
      actions.push({
        id: `${order.id}-accepted`,
        title: `${order.orderNumber}: можна починати`,
        details: `ВП: ${order.selectedFirePosition?.name || 'не вказано'}`,
        priority: 65,
        tone: 'success',
        route: '/map',
        queryParams: baseParams,
      });
    }

    if (order.status === 'in_progress') {
      actions.push({
        id: `${order.id}-progress`,
        title: `${order.orderNumber}: закрити результат`,
        details: `${this.minutesSince(order.startedAt || order.updatedAt)} хв у роботі`,
        priority: 60,
        tone: 'info',
        route: '/service-orders',
        queryParams: { filter: 'in_progress', view: 'cards', orderId: order.id },
      });
    }

    return actions;
  }

  private toTaskIssue(order: ServiceOrder, reason: 'overdue' | 'no_assignee' | 'long_progress'): OperatorAction {
    const base = { filter: reason, view: 'cards', orderId: order.id };

    if (reason === 'overdue') {
      return {
        id: `${order.id}-task-overdue`,
        title: `${order.orderNumber}: прострочено`,
        details: `${this.getStatusLabel(order.status)} · створено ${this.formatKyivShortDateTime(order.createdAt)} · Київ`,
        priority: 120,
        tone: 'danger',
        route: '/service-orders',
        queryParams: base,
      };
    }

    if (reason === 'no_assignee') {
      return {
        id: `${order.id}-task-no-assignee`,
        title: `${order.orderNumber}: немає виконавця`,
        details: `${order.targetSettlement || 'район не вказано'} · ${this.minutesSince(order.createdAt)} хв`,
        priority: 95,
        tone: 'warning',
        route: '/service-orders',
        queryParams: base,
      };
    }

    return {
      id: `${order.id}-task-long-progress`,
      title: `${order.orderNumber}: довго в роботі`,
      details: `${this.minutesSince(order.startedAt || order.updatedAt)} хв · перевір закриття результату`,
      priority: 80,
      tone: 'info',
      route: '/service-orders',
      queryParams: base,
    };
  }

  private isOrderOverdue(order: ServiceOrder): boolean {
    if (this.isTerminalOrder(order)) return false;

    const ageMinutes = this.minutesSince(order.createdAt);
    const workMinutes = this.minutesSince(order.startedAt || order.updatedAt);

    if (order.status === 'draft') return ageMinutes >= 60;
    if (order.status === 'proposed') return ageMinutes >= 45;
    if (['sent', 'sent_to_division', 'sent_to_battery'].includes(order.status)) return ageMinutes >= 90;
    if (order.status === 'accepted') return ageMinutes >= 120;
    if (order.status === 'in_progress') return workMinutes >= 180;
    if (order.status === 'rejected') return ageMinutes >= 60;

    return false;
  }

  private isTerminalOrder(order: ServiceOrder): boolean {
    return order.status === 'completed' || order.status === 'cancelled';
  }

  private minutesSince(date: string | null | undefined): number {
    return minutesSince(date);
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
