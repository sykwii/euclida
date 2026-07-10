import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { AuthService } from '../features/auth/auth.service';
import {
  EventLog,
  EventLogFilters,
  EventLogsService,
} from '../features/event-logs/event-logs.service';
import { RealtimeService } from './realtime.service';

export type EventFeedType = 'success' | 'warning' | 'danger' | 'info';
export type EventFeedMode = 'notifications' | 'today' | 'journal';
export type EventPriority = 'critical' | 'high' | 'normal' | 'low';

export interface EventFeedItem {
  id: string;
  type: EventFeedType;
  title: string;
  message?: string;
  details?: string;
  count?: number;
  route?: string;
  queryParams?: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface EventGroup {
  key: string;
  title: string;
  unitName: string | null;
  eventType: string;
  action: string;
  priority: EventPriority;
  tone: EventFeedType;
  latestAt: string;
  summary: string;
  unreadCount: number;
  items: EventLog[];
}

export interface EventFeedStats {
  unread: number;
  notifications: number;
  critical: number;
  high: number;
  today: number;
  journal: number;
}

@Injectable({
  providedIn: 'root',
})
export class EventFeedService implements OnDestroy {
  private readonly eventsSubject = new BehaviorSubject<EventLog[]>([]);
  private readonly legacyItemsSubject = new BehaviorSubject<EventFeedItem[]>([]);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);
  private loaded = false;
  private lastLoadedAt = 0;
  private loadQueued = false;
  private loadSubscription?: Subscription;
  private realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly realtimeSubscription = new Subscription();
  private readonly unregisterRealtimeEvent: () => void;

  readonly events$ = this.eventsSubject.asObservable();
  readonly items$ = this.legacyItemsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  snapshot: EventLog[] = [];
  shiftStartedAt = new Date();

  constructor(
    private readonly auth: AuthService,
    private readonly eventLogs: EventLogsService,
    private readonly realtime: RealtimeService,
  ) {
    setTimeout(() => this.ensureLoaded());

    this.unregisterRealtimeEvent = this.realtime.onEventCreated((event) => {
      const unitId = typeof event?.['unitId'] === 'string' ? event['unitId'] : undefined;

      if (!this.shouldRefreshForRealtimeUnit(unitId)) {
        return;
      }

      this.scheduleRealtimeRefresh();
    });

    this.realtimeSubscription.add(
      this.realtime.watchMany(['events', 'missions', 'stock', 'threats']).subscribe((event) => {
        if (!this.shouldRefreshForRealtimeUnit(event.unitId)) {
          return;
        }

        this.scheduleRealtimeRefresh();
      }),
    );
  }

  ensureLoaded(): void {
    const now = Date.now();
    const isFresh = this.loaded && now - this.lastLoadedAt < 30_000;

    if (this.loadingSubject.value || isFresh) {
      return;
    }

    this.load();
  }

  reset(): void {
    this.loadSubscription?.unsubscribe();
    this.snapshot = [];
    this.eventsSubject.next([]);
    this.legacyItemsSubject.next([]);
    this.loadingSubject.next(false);
    this.errorSubject.next(null);
    this.loaded = false;
    this.lastLoadedAt = 0;
    this.loadQueued = false;

    if (this.realtimeRefreshTimer) {
      clearTimeout(this.realtimeRefreshTimer);
      this.realtimeRefreshTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.unregisterRealtimeEvent?.();
    this.loadSubscription?.unsubscribe();
    this.realtimeSubscription.unsubscribe();

    if (this.realtimeRefreshTimer) {
      clearTimeout(this.realtimeRefreshTimer);
    }
  }

  load(filters: EventLogFilters = {}): void {
    const user = this.auth.getUser();

    if (!user || user.role === 'observer') {
      this.snapshot = [];
      this.eventsSubject.next([]);
      this.legacyItemsSubject.next([]);
      this.loadingSubject.next(false);
      this.errorSubject.next(null);
      this.loaded = true;
      this.lastLoadedAt = Date.now();
      return;
    }

    if (this.loadingSubject.value) {
      this.loadQueued = true;
      return;
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    this.loadSubscription = this.eventLogs.getAll({ limit: 300, ...filters }).subscribe({
      next: (events) => {
        this.snapshot = events;
        this.eventsSubject.next(events);
        this.legacyItemsSubject.next(
          this.getNotificationEvents()
            .slice(0, 50)
            .map((event) => this.toLegacyItem(event)),
        );
        this.loaded = true;
        this.lastLoadedAt = Date.now();
        this.loadingSubject.next(false);
        this.runQueuedLoad(filters);
      },
      error: () => {
        this.errorSubject.next('Дані подій тимчасово недоступні');
        this.loadingSubject.next(false);
        this.runQueuedLoad(filters);
      },
    });
  }

  private runQueuedLoad(filters: EventLogFilters): void {
    if (!this.loadQueued) {
      return;
    }

    this.loadQueued = false;
    queueMicrotask(() => this.load(filters));
  }

  private scheduleRealtimeRefresh(): void {
    if (this.realtimeRefreshTimer) {
      clearTimeout(this.realtimeRefreshTimer);
    }

    this.realtimeRefreshTimer = setTimeout(() => {
      this.realtimeRefreshTimer = null;
      this.load();
    }, 500);
  }

  private shouldRefreshForRealtimeUnit(unitId?: string): boolean {
    if (!unitId) {
      return true;
    }

    const user = this.auth.getUser();

    if (!user || user.role === 'admin' || user.scope === 'main') {
      return true;
    }

    if (user.scope === 'battery') {
      return unitId === user.unitId;
    }

    return true;
  }

  add(item: Omit<EventFeedItem, 'id' | 'createdAt'> & Partial<EventFeedItem>): void {
    const nextItem: EventFeedItem = {
      id: item.id || crypto.randomUUID(),
      type: item.type || 'info',
      title: item.title,
      message: item.message,
      details: item.details,
      count: item.count,
      route: item.route,
      queryParams: item.queryParams,
      createdAt: item.createdAt || new Date().toISOString(),
    };

    this.legacyItemsSubject.next([nextItem, ...this.legacyItemsSubject.value].slice(0, 50));
  }

  clear(): void {
    this.legacyItemsSubject.next([]);
  }

  get isLoading(): boolean {
    return this.loadingSubject.value;
  }

  get errorMessage(): string | null {
    return this.errorSubject.value;
  }

  get lastSyncedLabel(): string {
    if (!this.lastLoadedAt) {
      return '—';
    }

    return new Date(this.lastLoadedAt).toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  markNotificationsSeen(): void {
    const ids = this.getNotificationEvents()
      .filter((event) => this.isUnread(event))
      .map((event) => event.id);

    if (!ids.length) {
      return;
    }

    this.eventLogs.markRead(ids).subscribe({
      next: () => this.load(),
      error: () => this.load(),
    });
  }

  getGroups(mode: EventFeedMode = 'notifications'): EventGroup[] {
    const groups = new Map<string, EventGroup>();

    for (const event of this.getVisibleEvents(mode)) {
      const key = this.getGroupKey(event, mode);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: this.getGroupTitle(event),
          unitName: event.unitName,
          eventType: event.eventType,
          action: event.action,
          priority: this.getPriority(event),
          tone: this.getType(event.action),
          latestAt: event.createdAt,
          summary: this.getGroupSummary(event),
          unreadCount: 0,
          items: [],
        });
      }

      const group = groups.get(key);
      if (!group) {
        continue;
      }

      group.items.push(event);
      if (this.isUnread(event)) {
        group.unreadCount += 1;
      }

      if (new Date(event.createdAt).getTime() > new Date(group.latestAt).getTime()) {
        group.latestAt = event.createdAt;
        group.summary = this.getGroupSummary(event);
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: group.items
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, mode === 'journal' ? 40 : 12),
      }))
      .sort((a, b) => {
        const priorityDelta =
          this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority);
        if (priorityDelta !== 0 && mode === 'notifications') return priorityDelta;

        return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
      })
      .slice(0, mode === 'journal' ? 120 : 36);
  }

  getCounter(mode: EventFeedMode = 'notifications'): number {
    if (mode === 'notifications') {
      return this.getUnreadNotificationCount();
    }

    return this.getVisibleEvents(mode).length;
  }

  getUnreadNotificationCount(): number {
    return this.getNotificationEvents().filter((event) => this.isUnread(event)).length;
  }

  isUnread(event: EventLog): boolean {
    return !event.readAt;
  }

  getStats(): EventFeedStats {
    const notifications = this.getNotificationEvents();
    const unreadNotifications = notifications.filter((event) => this.isUnread(event));

    return {
      unread: unreadNotifications.length,
      notifications: unreadNotifications.length,
      critical: unreadNotifications.filter((event) => this.getPriority(event) === 'critical')
        .length,
      high: unreadNotifications.filter((event) => this.getPriority(event) === 'high').length,
      today: this.getVisibleEvents('today').length,
      journal: this.getVisibleEvents('journal').length,
    };
  }

  getJournalCount(): number {
    return this.getVisibleEvents('journal').length;
  }

  private getVisibleEvents(mode: EventFeedMode): EventLog[] {
    const events = [...this.snapshot].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    if (mode === 'journal') {
      return events.slice(0, 300);
    }

    if (mode === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return events
        .filter((event) => new Date(event.createdAt).getTime() >= start.getTime())
        .slice(0, 160);
    }

    return this.getNotificationEvents().filter((event) => this.isUnread(event));
  }

  private getNotificationEvents(): EventLog[] {
    return [...this.snapshot]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((event) => this.isNotificationEvent(event))
      .slice(0, 120);
  }

  private isNotificationEvent(event: EventLog): boolean {
    if (event.eventType === 'air_threat' || event.entityType === 'air_threat') {
      return true;
    }

    if (event.eventType === 'air_asset' || event.eventType === 'air_recon_area' || event.eventType === 'air_asset_task') {
      return ['created', 'updated', 'deleted'].includes(event.action);
    }

    if (event.eventType === 'service_order') {
      return [
        'created',
        'sent',
        'accepted',
        'rejected',
        'started',
        'completed',
        'cancelled',
      ].includes(event.action);
    }

    if (event.eventType === 'stock') {
      return ['moved', 'completed'].includes(event.action);
    }

    if (event.eventType === 'fire_position' || event.eventType === 'weapon') {
      return ['not_ready', 'assigned', 'removed', 'moved'].includes(event.action);
    }

    return ['danger', 'critical', 'warning'].includes(event.action);
  }

  getEventPriority(event: EventLog): EventPriority {
    return this.getPriority(event);
  }

  getEventTone(event: EventLog): EventFeedType {
    return this.getType(event.action);
  }

  getEventActionLabel(event: EventLog): string {
    return this.getActionLabel(event.action);
  }

  private getPriority(event: EventLog): EventPriority {
    if (event.action === 'critical' || event.eventType === 'air_threat') return 'critical';
    if (['rejected', 'cancelled', 'not_ready', 'danger'].includes(event.action)) return 'high';
    if (['sent', 'accepted', 'started', 'moved', 'warning'].includes(event.action)) return 'normal';

    return 'low';
  }

  private getPriorityWeight(priority: EventPriority): number {
    if (priority === 'critical') return 4;
    if (priority === 'high') return 3;
    if (priority === 'normal') return 2;
    return 1;
  }

  private getGroupKey(event: EventLog, mode: EventFeedMode): string {
    if (mode === 'journal') {
      return [event.eventType, event.action, event.unitId || 'none'].join('|');
    }

    return [event.eventType, event.action, event.unitId || 'none', event.entityType || 'none'].join(
      '|',
    );
  }

  private getGroupTitle(event: EventLog): string {
    if (event.eventType === 'service_order') return `ВГЗ · ${this.getActionLabel(event.action)}`;
    if (event.eventType === 'stock') return `Логістика · ${this.getActionLabel(event.action)}`;
    if (event.eventType === 'air_threat' || event.entityType === 'air_threat')
      return `Повітряні загрози · ${this.getActionLabel(event.action)}`;
    if (event.eventType === 'air_asset') return `Повітряні розрахунки · ${this.getActionLabel(event.action)}`;
    if (event.eventType === 'air_recon_area') return `Райони розвідки · ${this.getActionLabel(event.action)}`;
    if (event.eventType === 'air_asset_task') return `Повітряні задачі · ${this.getActionLabel(event.action)}`;
    if (event.eventType === 'fire_position') return `ВП · ${this.getActionLabel(event.action)}`;
    if (event.eventType === 'weapon') return `СГ · ${this.getActionLabel(event.action)}`;
    if (event.eventType === 'operator_shift') return `Зміна · ${this.getActionLabel(event.action)}`;

    return event.title;
  }

  private getGroupSummary(event: EventLog): string {
    const entityName = event.entityName ? `${event.entityName}. ` : '';
    const details = event.details || event.title;

    return `${entityName}${details}`.trim();
  }

  private getActionLabel(action: string): string {
    if (action === 'created') return 'створено';
    if (action === 'sent') return 'надіслано';
    if (action === 'accepted') return 'прийнято';
    if (action === 'rejected') return 'відхилено';
    if (action === 'started') return 'почато';
    if (action === 'completed') return 'завершено';
    if (action === 'cancelled') return 'скасовано';
    if (action === 'moved') return 'переміщено';
    if (action === 'updated') return 'оновлено';
    if (action === 'deleted') return 'видалено';
    if (action === 'assigned') return 'призначено';
    if (action === 'removed') return 'знято';
    if (action === 'not_ready') return 'не БГ';
    if (action === 'critical') return 'критично';
    if (action === 'warning') return 'увага';
    if (action === 'ended') return 'завершено';
    return action;
  }

  private toLegacyItem(event: EventLog): EventFeedItem {
    return {
      id: event.id,
      type: this.getType(event.action),
      title: event.title,
      message: event.details || event.title,
      details: event.details || event.title,
      route: this.getRoute(event),
      queryParams: this.getQueryParams(event),
      createdAt: event.createdAt,
    };
  }

  private getRoute(event: EventLog): string | undefined {
    if (event.eventType === 'service_order') return '/service-orders';
    if (event.eventType === 'weapon') return '/weapon-systems';
    if (event.eventType === 'fire_position') return '/fire-positions';
    if (event.eventType === 'stock') return '/stock';
    if (event.eventType === 'air_threat') return '/map';
    if (event.eventType === 'air_asset' || event.eventType === 'air_recon_area' || event.eventType === 'air_asset_task') return '/air-assets';

    return undefined;
  }

  private getQueryParams(event: EventLog): Record<string, string | number | boolean> | undefined {
    if (!event.entityId) return undefined;

    if (event.eventType === 'service_order') {
      return { orderId: event.entityId, view: 'cards' };
    }

    return { entityId: event.entityId };
  }

  private getType(action: string): EventFeedType {
    if (
      action === 'created' ||
      action === 'assigned' ||
      action === 'accepted' ||
      action === 'completed'
    ) {
      return 'success';
    }

    if (
      action === 'deleted' ||
      action === 'rejected' ||
      action === 'cancelled' ||
      action === 'critical' ||
      action === 'danger' ||
      action === 'not_ready'
    ) {
      return 'danger';
    }

    if (
      action === 'moved' ||
      action === 'updated' ||
      action === 'started' ||
      action === 'sent' ||
      action === 'warning'
    ) {
      return 'warning';
    }

    return 'info';
  }
}
