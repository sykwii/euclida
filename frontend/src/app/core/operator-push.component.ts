import { CommonModule, DatePipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../features/auth/auth.service';
import { EventLog } from '../features/event-logs/event-logs.service';
import { EventFeedService } from './event-feed.service';

type PushTone = 'danger' | 'warning' | 'info' | 'success';

interface OperatorPush {
  id: string;
  key: string;
  tone: PushTone;
  title: string;
  details: string;
  createdAt: string;
  count: number;
  sticky: boolean;
  event: EventLog;
}

@Component({
  selector: 'app-operator-push',
  standalone: true,
  imports: [CommonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="op-push"
      aria-label="Оперативні push-повідомлення"
    >
      <section class="op-mini-center" *ngIf="miniOpen" aria-label="Останні події">
        <header>
          <div>
            <span>Останні події</span>
            <strong>{{ latestEvents.length }}</strong>
          </div>
          <button type="button" (click)="toggleMini($event)" title="Згорнути міні-центр">×</button>
        </header>

        <button
          type="button"
          class="op-mini-event"
          *ngFor="let event of latestEvents; trackBy: trackEvent"
          [ngClass]="'tone-' + getTone(event)"
          (click)="openEvent(event)"
        >
          <i aria-hidden="true"></i>
          <span>
            <strong>{{ getTitle(event) }}</strong>
            <small>{{ getDetails(event) }}</small>
          </span>
          <time>{{ event.createdAt | date: 'HH:mm' }}</time>
        </button>

        <button type="button" class="op-mini-all" (click)="openCenter()">Центр повідомлень</button>
      </section>

      <article
        class="op-push-card"
        *ngFor="let push of pushes; trackBy: trackPush"
        [ngClass]="'tone-' + push.tone"
        tabindex="0"
        (click)="open(push)"
        (keydown.enter)="open(push)"
        (keydown.space)="$event.preventDefault(); open(push)"
      >
        <i aria-hidden="true"></i>
        <span class="op-push-main">
          <strong>{{ push.title }}</strong>
          <small>{{ push.details }}</small>
        </span>
        <span class="op-push-side">
          <time>{{ push.createdAt | date: 'HH:mm' }}</time>
          <b *ngIf="push.count > 1">+{{ push.count }}</b>
        </span>
        <button
          type="button"
          class="op-push-close"
          (click)="dismiss(push.id, $event)"
          aria-label="Закрити повідомлення"
        >
          ×
        </button>
      </article>

      <button
        type="button"
        class="op-mini-toggle"
        [class.active]="miniOpen"
        (click)="toggleMini($event)"
        title="Показати 5 останніх подій"
      >
        <span aria-hidden="true"></span>
        <b>{{ latestEvents.length }}</b>
      </button>
    </aside>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: var(--z-notifications, 900);
        pointer-events: none;
      }

      .op-push {
        position: absolute;
        top: auto;
        right: 16px;
        bottom: 16px;
        width: min(330px, calc(100vw - 32px));
        display: grid;
        gap: 7px;
        justify-items: end;
        pointer-events: none;
      }

      .op-push-card,
      .op-mini-toggle,
      .op-mini-center {
        pointer-events: auto;
      }

      .op-push-card {
        position: relative;
        display: grid;
        grid-template-columns: 9px minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        min-height: 48px;
        width: 100%;
        padding: 8px 34px 8px 9px;
        border: 1px solid rgba(45, 231, 214, 0.22);
        border-radius: 8px;
        background: rgba(3, 12, 17, 0.9);
        color: #eef9fb;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.34);
        text-align: left;
        backdrop-filter: blur(8px);
        cursor: pointer;
      }

      .op-push-card:hover,
      .op-push-card:focus-visible {
        border-color: rgba(45, 231, 214, 0.46);
        background: rgba(5, 25, 31, 0.98);
      }

      .op-push-card i {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #2de7d6;
        box-shadow: 0 0 12px currentColor;
      }

      .op-push-main {
        min-width: 0;
      }

      .op-push-main strong,
      .op-push-main small {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .op-push-main strong {
        color: #f4fbfc;
        font-size: 11px;
        font-weight: 950;
        line-height: 1.15;
      }

      .op-push-main small {
        margin-top: 2px;
        color: #94a3b8;
        font-size: 10px;
        font-weight: 760;
      }

      .op-push-side {
        display: grid;
        justify-items: end;
        gap: 3px;
      }

      .op-push-side time {
        color: #9fb4bf;
        font-size: 10px;
        font-weight: 850;
        font-variant-numeric: tabular-nums;
      }

      .op-push-side b {
        min-width: 22px;
        height: 18px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background: rgba(216, 237, 243, 0.08);
        color: #dffcf7;
        font-size: 10px;
      }

      .op-push-close {
        position: absolute;
        top: 7px;
        right: 7px;
        width: 20px;
        height: 20px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(216, 237, 243, 0.12);
        border-radius: 6px;
        background: rgba(216, 237, 243, 0.045);
        color: #c8d7de;
        font-size: 15px;
        line-height: 1;
      }

      .tone-danger {
        border-color: rgba(240, 93, 94, 0.42);
        background: linear-gradient(180deg, rgba(36, 10, 14, 0.98), rgba(6, 14, 18, 0.98));
      }

      .tone-danger i {
        background: #f05d5e;
        color: #f05d5e;
      }

      .tone-warning {
        border-color: rgba(242, 183, 36, 0.38);
      }

      .tone-warning i {
        background: #f2b724;
        color: #f2b724;
      }

      .tone-info {
        border-color: rgba(79, 163, 255, 0.34);
      }

      .tone-info i {
        background: #4fa3ff;
        color: #4fa3ff;
      }

      .tone-success i {
        background: #22c55e;
        color: #22c55e;
      }

      .op-mini-toggle {
        position: relative;
        width: 42px;
        height: 38px;
        display: grid;
        place-items: center;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid rgba(45, 231, 214, 0.32);
        border-radius: 10px;
        background: rgba(3, 12, 17, 0.9);
        color: #dffcf7;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.3);
      }

      .op-mini-toggle.active {
        border-color: rgba(45, 231, 214, 0.62);
        background: rgba(5, 30, 34, 0.98);
      }

      .op-mini-toggle span {
        width: 14px;
        height: 14px;
        border-radius: 4px;
        border: 2px solid #2de7d6;
        box-shadow: 0 0 16px rgba(45, 231, 214, 0.28);
      }

      .op-mini-toggle b {
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 20px;
        height: 20px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background: #f2b724;
        color: #061015;
        font-size: 10px;
      }

      .op-mini-center {
        width: min(330px, calc(100vw - 32px));
        display: grid;
        gap: 7px;
        padding: 10px;
        border: 1px solid rgba(45, 231, 214, 0.2);
        border-radius: 10px;
        background: rgba(3, 12, 17, 0.98);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
        animation: euFadeIn 0.22s ease both;
      }

      .op-mini-center header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(216, 237, 243, 0.08);
      }

      .op-mini-center header span {
        display: block;
        color: #7e9aa4;
        font-size: 10px;
        font-weight: 900;
      }

      .op-mini-center header strong {
        color: #f4fbfc;
        font-size: 13px;
      }

      .op-mini-center header button {
        width: 26px;
        height: 26px;
        padding: 0;
      }

      .op-mini-event {
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        min-height: 42px;
        width: 100%;
        padding: 7px;
        border: 1px solid rgba(216, 237, 243, 0.08);
        border-radius: 7px;
        background: rgba(216, 237, 243, 0.035);
        text-align: left;
      }

      .op-mini-event i {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #4fa3ff;
      }

      .op-mini-event span {
        min-width: 0;
      }

      .op-mini-event strong,
      .op-mini-event small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .op-mini-event strong {
        color: #f4fbfc;
        font-size: 11px;
        font-weight: 950;
      }

      .op-mini-event small,
      .op-mini-event time {
        color: #9fb4bf;
        font-size: 10px;
      }

      .op-mini-all {
        min-height: 30px;
        color: #9ffcf3;
      }

      @media (max-width: 860px) {
        .op-push {
          top: auto;
          right: 10px;
          bottom: calc(68px + env(safe-area-inset-bottom));
          left: 10px;
          width: auto;
        }
      }
    `,
  ],
})
export class OperatorPushComponent implements OnInit, AfterViewInit, OnDestroy {
  pushes: OperatorPush[] = [];
  hiddenCount = 0;
  latestEvents: EventLog[] = [];
  miniOpen = false;
  canShow = false;

  private readonly subscriptions = new Subscription();
  private readonly knownEventIds = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private initialized = false;
  private firstRenderComplete = false;
  private pendingEvents: EventLog[] | null = null;
  private eventFlushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly eventFeed: EventFeedService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.eventFeed.ensureLoaded();

    this.subscriptions.add(
      this.auth.currentUser$.subscribe(() => this.updateCanShow()),
    );

    this.subscriptions.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => this.updateCanShow()),
    );

    this.subscriptions.add(
      this.eventFeed.events$.subscribe((events) => {
        this.pendingEvents = events;
        this.scheduleEventFlush();
      }),
    );
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.firstRenderComplete = true;
      this.updateCanShow();
      this.scheduleEventFlush();
    }, 0);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.eventFlushTimer) clearTimeout(this.eventFlushTimer);
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  dismiss(id: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    this.pushes = this.pushes.filter((push) => push.id !== id);
    this.cdr.markForCheck();
  }

  open(push: OperatorPush): void {
    this.dismiss(push.id);
    void this.router.navigate(this.getRoute(push.event), {
      queryParams: this.getQueryParams(push.event),
    });
  }

  openCenter(): void {
    this.hiddenCount = 0;
    this.miniOpen = false;
    void this.router.navigate(['/notifications']);
  }

  trackPush(_: number, push: OperatorPush): string {
    return push.id;
  }

  trackEvent(_: number, event: EventLog): string {
    return event.id;
  }

  toggleMini(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.miniOpen = !this.miniOpen;
    this.cdr.markForCheck();
  }

  openEvent(event: EventLog): void {
    this.miniOpen = false;
    this.cdr.markForCheck();
    void this.router.navigate(this.getRoute(event), {
      queryParams: this.getQueryParams(event),
    });
  }

  private updateCanShow(): void {
    this.canShow = this.auth.isLoggedIn() && !this.router.url.startsWith('/login');
    this.cdr.markForCheck();
  }

  private scheduleEventFlush(): void {
    if (!this.firstRenderComplete || !this.pendingEvents) {
      return;
    }

    if (this.eventFlushTimer) {
      clearTimeout(this.eventFlushTimer);
    }

    this.eventFlushTimer = setTimeout(() => {
      this.eventFlushTimer = null;
      const events = this.pendingEvents;
      this.pendingEvents = null;

      if (events) {
        this.handleEvents(events);
        this.cdr.markForCheck();
      }
    }, 0);
  }

  private handleEvents(events: EventLog[]): void {
    this.latestEvents = events.slice(0, 5);

    if (!this.initialized) {
      events.forEach((event) => this.knownEventIds.add(event.id));
      this.initialized = true;
      return;
    }

    const freshEvents = events
      .filter((event) => !this.knownEventIds.has(event.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    freshEvents.forEach((event) => {
      this.knownEventIds.add(event.id);

      if (this.shouldShow(event)) {
        this.show(event);
      }
    });
  }

  private show(event: EventLog): void {
    const push = this.toPush(event);
    const existing = this.pushes.find((item) => item.key === push.key);

    if (existing) {
      existing.count += 1;
      existing.createdAt = push.createdAt;
      existing.event = push.event;
      existing.details = push.details;
      this.schedule(existing);
      this.pushes = [existing, ...this.pushes.filter((item) => item.id !== existing.id)];
    } else {
      this.pushes = [push, ...this.pushes];
      this.schedule(push);
    }

    if (this.pushes.length > 1) {
      const sticky = this.pushes.filter((item) => item.sticky);
      const regular = this.pushes.filter((item) => !item.sticky);
      const visible = [...sticky, ...regular].slice(0, 1);
      this.hiddenCount += this.pushes.length - visible.length;
      this.pushes = visible;
    }
  }

  private schedule(push: OperatorPush): void {
    const current = this.timers.get(push.id);
    if (current) {
      clearTimeout(current);
    }

    if (push.sticky) {
      return;
    }

    const ttl = push.tone === 'warning' ? 14_000 : 8_000;
    this.timers.set(
      push.id,
      setTimeout(() => this.dismiss(push.id), ttl),
    );
  }

  private shouldShow(event: EventLog): boolean {
    if (event.eventType === 'air_threat' || event.entityType === 'air_threat') return true;
    if (event.eventType === 'air_asset' || event.eventType === 'air_recon_area' || event.eventType === 'air_asset_task') {
      return ['created', 'updated', 'deleted'].includes(event.action);
    }
    if (event.eventType === 'service_order') return true;
    if (event.eventType === 'stock') return ['moved', 'completed'].includes(event.action);
    if (event.eventType === 'fire_position')
      return ['not_ready', 'assigned', 'removed'].includes(event.action);
    if (event.eventType === 'weapon')
      return ['not_ready', 'assigned', 'removed', 'moved'].includes(event.action);

    return ['critical', 'warning', 'danger'].includes(event.action);
  }

  private toPush(event: EventLog): OperatorPush {
    return {
      id: event.id,
      key: this.getKey(event),
      tone: this.getTone(event),
      title: this.getTitle(event),
      details: this.getDetails(event),
      createdAt: event.createdAt,
      count: 1,
      sticky: this.isSticky(event),
      event,
    };
  }

  private getKey(event: EventLog): string {
    return [
      event.eventType,
      event.action,
      event.entityId || event.entityName || event.unitId || 'none',
    ].join('|');
  }

  getTone(event: EventLog): PushTone {
    if (event.eventType === 'air_threat') return 'danger';
    if (['critical', 'danger', 'not_ready', 'rejected', 'cancelled'].includes(event.action))
      return 'danger';
    if (['created', 'sent', 'accepted', 'started', 'moved', 'warning'].includes(event.action))
      return 'warning';
    if (['completed', 'assigned'].includes(event.action)) return 'success';

    return 'info';
  }

  private isSticky(event: EventLog): boolean {
    return (
      event.eventType === 'air_threat' ||
      ['critical', 'danger', 'not_ready', 'rejected', 'cancelled'].includes(event.action) ||
      (event.eventType === 'service_order' && ['created', 'rejected'].includes(event.action))
    );
  }

  getTitle(event: EventLog): string {
    if (event.eventType === 'service_order') {
      const number = event.entityName || event.title.match(/[\w/-]+/)?.[0] || 'ВГЗ';
      if (event.action === 'created') return `Нове ВГЗ ${number}`;
      if (event.action === 'sent') return `ВГЗ ${number} передано`;
      if (event.action === 'accepted') return `ВГЗ ${number} прийнято`;
      if (event.action === 'started') return `Почато роботу ${number}`;
      if (event.action === 'completed') return `ВГЗ ${number} завершено`;
      if (event.action === 'rejected') return `ВГЗ ${number} відхилено`;
      if (event.action === 'cancelled') return `ВГЗ ${number} скасовано`;
    }

    if (event.eventType === 'stock')
      return event.action === 'completed' ? 'БК прийнято' : 'Передача БК';
    if (event.eventType === 'fire_position')
      return event.action === 'not_ready' ? 'ВП НЕ БГ' : 'Оновлення ВП';
    if (event.eventType === 'weapon')
      return event.action === 'not_ready' ? 'СГ НЕ БГ' : 'Оновлення СГ';
    if (event.eventType === 'air_threat') return 'Повітряна загроза';
    if (event.eventType === 'air_asset_task') return event.title || 'Повітряна задача';
    if (event.eventType === 'air_asset' || event.eventType === 'air_recon_area') return event.title || 'Повітряні засоби';

    return event.title || 'Нова подія';
  }

  getDetails(event: EventLog): string {
    const object = event.entityName || event.unitName || '';
    const details = event.details || event.title || '';
    const shortDetails = details.length > 92 ? `${details.slice(0, 89)}...` : details;

    return [object, shortDetails].filter(Boolean).join(' · ') || 'Оновлення обстановки';
  }

  private getRoute(event: EventLog): string[] {
    if (event.eventType === 'service_order') return ['/service-orders'];
    if (event.eventType === 'stock') return ['/stock-movements'];
    if (event.eventType === 'weapon') return ['/weapon-systems'];
    if (event.eventType === 'fire_position') return ['/fire-positions'];
    if (event.eventType === 'air_threat') return ['/map'];
    if (event.eventType === 'air_asset' || event.eventType === 'air_recon_area' || event.eventType === 'air_asset_task') return ['/air-assets'];

    return ['/notifications'];
  }

  private getQueryParams(event: EventLog): Record<string, string> | undefined {
    if (event.eventType === 'service_order') {
      return event.entityId ? { orderId: event.entityId, view: 'list' } : { view: 'list' };
    }

    return event.entityId ? { entityId: event.entityId } : undefined;
  }
}
