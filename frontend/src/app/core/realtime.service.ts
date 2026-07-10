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
  version?: number;
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
  version?: number;
  scope?: string;
  action?: string;
  entity?: string;
  id?: string;
  unitId?: string;
  reason?: string;
  at?: string;
  [key: string]: unknown;
}

type RealtimeCallback = (payload?: RealtimePayload) => void;
type AnyRealtimeCallback = (eventName: RealtimeEventName, payload?: RealtimePayload) => void;

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly realtimeEvents$ = new Subject<RealtimeEventPayload>();
  private readonly callbacks = new Map<RealtimeEventName, Set<RealtimeCallback>>();
  private readonly anyCallbacks = new Set<AnyRealtimeCallback>();
  private lastRealtimeKey = '';
  private lastRealtimeAt = 0;
  private hadDisconnect = false;
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
      auth: (callback) => {
        callback({
          token: this.getRealtimeToken(),
        });
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 8000,
    });

    this.socket.on('connect', () => {
      this.zone.run(() => {
        const wasDisconnected = this.hadDisconnect;
        this.connected$.next(true);
        this.hadDisconnect = false;

        if (wasDisconnected) {
          this.processIncomingRealtimeEvent({
            version: 1,
            scope: 'all',
            entity: 'system',
            action: 'changed',
            reason: 'reconnect',
            at: new Date().toISOString(),
          });
        }
      });
    });

    this.socket.on('disconnect', () => {
      this.zone.run(() => {
        this.hadDisconnect = true;
        this.connected$.next(false);
      });
    });

    this.socket.on('connect_error', () => {
      this.zone.run(() => {
        this.hadDisconnect = true;
        this.connected$.next(false);
      });
    });

    this.socket.on('realtime:event', (payload?: Partial<RealtimeEventPayload>) => {
      this.zone.run(() => this.processIncomingRealtimeEvent(this.normalizeRealtimePayload(payload)));
    });
  }

  onServiceOrdersChanged(callback: (payload?: RealtimePayload) => void): () => void {
    return this.register('service_order_changed', callback);
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

  onAnyChanged(callback: AnyRealtimeCallback): () => void {
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

  private processIncomingRealtimeEvent(payload: RealtimeEventPayload): void {
    if (!this.emitRealtimePayload(payload)) {
      return;
    }

    const eventNames = this.compatibilityEventNames(payload);
    const compatPayload = this.toCompatibilityPayload(payload);

    eventNames.forEach((eventName) => this.runCallbacks(eventName, compatPayload));
    eventNames.forEach((eventName) => this.runAnyCallbacks(eventName, compatPayload));
  }

  private emitRealtimePayload(payload: RealtimeEventPayload): boolean {
    const key = [
      payload.version || 1,
      payload.scope,
      payload.entity || '',
      payload.action || '',
      payload.id || '',
      payload.unitId || '',
      payload.reason || '',
      payload.at || '',
    ].join('|');
    const now = Date.now();

    if (key === this.lastRealtimeKey && now - this.lastRealtimeAt < 500) {
      return false;
    }

    this.lastRealtimeKey = key;
    this.lastRealtimeAt = now;
    this.realtimeEvents$.next(payload);
    return true;
  }

  private register(eventName: RealtimeEventName, callback: RealtimeCallback): () => void {
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
      version: typeof payload?.version === 'number' ? payload.version : 1,
      scope: this.isRealtimeScope(payload?.scope) ? payload.scope : 'all',
      action: typeof payload?.action === 'string' ? payload.action : undefined,
      entity: typeof payload?.entity === 'string' ? payload.entity : undefined,
      id: typeof payload?.id === 'string' ? payload.id : undefined,
      unitId: typeof payload?.unitId === 'string' ? payload.unitId : undefined,
      reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
      at: typeof payload?.at === 'string' ? payload.at : new Date().toISOString(),
    };
  }

  private toCompatibilityPayload(payload: RealtimeEventPayload): RealtimePayload {
    return {
      version: payload.version || 1,
      scope: payload.scope,
      action: payload.action,
      entity: payload.entity,
      id: payload.id,
      unitId: payload.unitId,
      reason: payload.reason,
      at: payload.at,
    };
  }

  private compatibilityEventNames(payload: RealtimeEventPayload): RealtimeEventName[] {
    const names: RealtimeEventName[] = [];

    if (payload.scope === 'all') {
      names.push('all_changed');
    }

    if (payload.scope === 'map') {
      names.push('map_changed');
    }

    if (payload.scope === 'stock') {
      names.push('stock_changed');
    }

    if (payload.scope === 'analytics') {
      names.push('analytics_changed');
    }

    if (payload.scope === 'reference') {
      names.push('reference_changed');
    }

    if (payload.scope === 'users') {
      names.push('user_changed');
    }

    if (payload.scope === 'settings') {
      names.push('settings_changed');
    }

    if (payload.scope === 'events') {
      names.push('event_created');
    }

    if (payload.scope === 'threats') {
      names.push('threat_changed');
    }

    if (payload.scope === 'missions' && payload.entity === 'service_order') {
      names.push('service_order_changed');
    }

    if (payload.scope === 'missions' && payload.entity === 'fire_mission') {
      names.push('fire_mission_changed');
    }

    return Array.from(new Set(names));
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

  private getRealtimeToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    return localStorage.getItem('euclida_access_token');
  }
}
