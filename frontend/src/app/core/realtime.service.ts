import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, NgZone, OnDestroy, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, Observable, Subject, filter } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { API_URL } from './api-config';

export type RealtimeScope =
  | 'all'
  | 'missions'
  | 'stock'
  | 'map'
  | 'analytics'
  | 'events'
  | 'reference'
  | 'users'
  | 'settings'
  | 'weapons'
  | 'recon'
  | 'threats'
  | 'logistics';

export interface RealtimeEventPayload {
  scope: RealtimeScope;
  action?: string;
  entity?: string;
  id?: string;
  unitId?: string;
  reason?: string;
  at?: string;
}

export type RealtimeEventName =
  | 'threat_changed'
  | 'service_order_changed'
  | 'fire_mission_changed'
  | 'map_changed'
  | 'stock_changed'
  | 'event_created'
  | 'analytics_changed'
  | 'reference_changed'
  | 'user_changed'
  | 'settings_changed'
  | 'all_changed';

export interface RealtimePayload {
  scope?: string;
  action?: string;
  entity?: string;
  id?: string;
  at?: string;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly realtimeEvents$ = new Subject<RealtimeEventPayload>();
  private readonly callbacks = new Map<
    RealtimeEventName,
    Set<(payload?: RealtimePayload) => void>
  >();
  private readonly anyCallbacks = new Set<
    (eventName: RealtimeEventName, payload?: RealtimePayload) => void
  >();
  private lastRealtimeKey = '';
  private lastRealtimeAt = 0;
  readonly connected$ = new BehaviorSubject<boolean>(false);

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly zone: NgZone,
  ) {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 8000,
    });

    this.socket.on('connect', () => this.zone.run(() => this.connected$.next(true)));
    this.socket.on('disconnect', () => this.zone.run(() => this.connected$.next(false)));
    this.socket.on('connect_error', () => this.zone.run(() => this.connected$.next(false)));
    this.socket.on('realtime:event', (payload?: Partial<RealtimeEventPayload>) => {
      this.zone.run(() => this.emitRealtimePayload(this.normalizeRealtimePayload(payload)));
    });
    this.eventNames().forEach((eventName) => this.bindSocketEvent(eventName));
  }

  onThreatsChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('threat_changed', callback);
  }

  onServiceOrdersChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('service_order_changed', callback);
  }

  onFireMissionsChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('fire_mission_changed', callback);
  }

  onMapChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('map_changed', callback);
  }

  onStockChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('stock_changed', callback);
  }

  onEventCreated(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('event_created', callback);
  }

  onAnalyticsChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('analytics_changed', callback);
  }

  onReferenceChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('reference_changed', callback);
  }

  onUsersChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('user_changed', callback);
  }

  onSettingsChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('settings_changed', callback);
  }

  onAllChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('all_changed', callback);
  }

  onAnyChanged(
    callback: (eventName: RealtimeEventName, payload?: RealtimePayload) => void,
  ): () => void {
    this.anyCallbacks.add(callback);
    return () => this.anyCallbacks.delete(callback);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected$.next(false);
    this.anyCallbacks.clear();
    this.callbacks.clear();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private eventNames(): RealtimeEventName[] {
    return [
      'threat_changed',
      'service_order_changed',
      'fire_mission_changed',
      'map_changed',
      'stock_changed',
      'event_created',
      'analytics_changed',
      'reference_changed',
      'user_changed',
      'settings_changed',
      'all_changed',
    ];
  }

  private bindSocketEvent(eventName: RealtimeEventName): void {
    this.socket?.on(eventName, (payload?: RealtimePayload) => {
      this.zone.run(() => {
        const realtimePayload = this.toRealtimePayload(eventName, payload);
        this.emitRealtimePayload(realtimePayload);
        this.runCallbacks(eventName, payload);
        this.runAnyCallbacks(eventName, payload);
      });
    });
  }

  private emitRealtimePayload(payload: RealtimeEventPayload): void {
    const key = [
      payload.scope,
      payload.entity || '',
      payload.id || '',
      payload.unitId || '',
      payload.reason || payload.action || '',
    ].join('|');
    const now = Date.now();

    if (key === this.lastRealtimeKey && now - this.lastRealtimeAt < 500) {
      return;
    }

    this.lastRealtimeKey = key;
    this.lastRealtimeAt = now;
    this.realtimeEvents$.next(payload);
  }

  private register(
    eventName: RealtimeEventName,
    callback: (payload?: RealtimePayload) => void,
  ): () => void {
    if (!this.callbacks.has(eventName)) {
      this.callbacks.set(eventName, new Set());
    }
    this.callbacks.get(eventName)?.add(callback);

    return () => this.callbacks.get(eventName)?.delete(callback);
  }

  private runCallbacks(eventName: RealtimeEventName, payload?: RealtimePayload): void {
    this.callbacks.get(eventName)?.forEach((callback) => {
      try {
        callback(payload);
      } catch {
        // Isolate realtime callback failures so one page cannot break global sync.
      }
    });
  }

  private runAnyCallbacks(eventName: RealtimeEventName, payload?: RealtimePayload): void {
    this.anyCallbacks.forEach((callback) => {
      try {
        callback(eventName, payload);
      } catch {
        // Isolate realtime callback failures so one listener cannot break global sync.
      }
    });
  }

  private normalizeRealtimePayload(payload?: Partial<RealtimeEventPayload>): RealtimeEventPayload {
    return {
      scope: this.isRealtimeScope(payload?.scope) ? payload.scope : 'all',
      action: typeof payload?.action === 'string' ? payload.action : undefined,
      entity: typeof payload?.entity === 'string' ? payload.entity : undefined,
      id: typeof payload?.id === 'string' ? payload.id : undefined,
      unitId: typeof payload?.unitId === 'string' ? payload.unitId : undefined,
      reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
      at: typeof payload?.at === 'string' ? payload.at : new Date().toISOString(),
    };
  }

  private toRealtimePayload(
    eventName: RealtimeEventName,
    payload?: RealtimePayload,
  ): RealtimeEventPayload {
    const fallbackScope = this.scopeFromEventName(eventName);
    const payloadScope = typeof payload?.['scope'] === 'string' ? payload['scope'] : undefined;

    return {
      scope: this.isRealtimeScope(payloadScope) ? payloadScope : fallbackScope,
      action: typeof payload?.['action'] === 'string' ? payload['action'] : eventName,
      entity: typeof payload?.['entity'] === 'string' ? payload['entity'] : undefined,
      id: typeof payload?.['id'] === 'string' ? payload['id'] : undefined,
      unitId: typeof payload?.['unitId'] === 'string' ? payload['unitId'] : undefined,
      reason: typeof payload?.['reason'] === 'string' ? payload['reason'] : eventName,
      at: typeof payload?.['at'] === 'string' ? payload['at'] : new Date().toISOString(),
    };
  }

  private scopeFromEventName(eventName: RealtimeEventName): RealtimeScope {
    if (eventName === 'threat_changed') return 'threats';
    if (eventName === 'service_order_changed' || eventName === 'fire_mission_changed')
      return 'missions';
    if (eventName === 'map_changed') return 'map';
    if (eventName === 'stock_changed') return 'stock';
    if (eventName === 'event_created') return 'events';
    if (eventName === 'analytics_changed') return 'analytics';
    if (eventName === 'reference_changed') return 'reference';
    if (eventName === 'user_changed') return 'users';
    if (eventName === 'settings_changed') return 'settings';
    return 'all';
  }

  private isRealtimeScope(scope: unknown): scope is RealtimeScope {
    return [
      'all',
      'missions',
      'stock',
      'map',
      'analytics',
      'events',
      'reference',
      'users',
      'settings',
      'weapons',
      'recon',
      'threats',
      'logistics',
    ].includes(String(scope));
  }

  watch(scope: RealtimeScope): Observable<RealtimeEventPayload> {
    return this.realtimeEvents$.pipe(
      filter((event) => event.scope === scope || event.scope === 'all'),
    );
  }

  watchMany(scopes: RealtimeScope[]): Observable<RealtimeEventPayload> {
    const normalizedScopes = Array.from(new Set(scopes));

    return this.realtimeEvents$.pipe(
      filter((event) => event.scope === 'all' || normalizedScopes.includes(event.scope)),
    );
  }
}
