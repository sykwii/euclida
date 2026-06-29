import { Injectable } from '@angular/core';
import { Subscription, auditTime, map } from 'rxjs';
import { RealtimeScope, RealtimeService } from './realtime.service';

export type RefreshScope = RealtimeScope;

export interface RefreshEvent {
  scope: RefreshScope;
  reason: string;
  at: Date;
}

@Injectable({ providedIn: 'root' })
export class AutoRefreshService {
  constructor(private readonly realtime: RealtimeService) {}

  watch(scopes: RefreshScope[], callback: (event: RefreshEvent) => void): Subscription {
    return this.realtime.watchMany(scopes).pipe(
      auditTime(500),
      map((payload) => ({
        scope: payload.scope,
        reason: payload.reason || payload.action || 'realtime',
        at: this.toSafeDate(payload.at),
      })),
    ).subscribe((event) => callback(event));
  }

  private toSafeDate(value?: string): Date {
    if (!value) {
      return new Date();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  watchAll(callback: (event: RefreshEvent) => void): Subscription {
    return this.watch(
      [
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
        'threats',
      ],
      callback,
    );
  }
}