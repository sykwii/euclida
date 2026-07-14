import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { RealtimeService } from '../../core/realtime.service';
import {
  OperationalNotification,
  OperationalNotificationsService,
} from './operational-notifications.service';

@Component({
  selector: 'app-operational-notification-overlay',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <aside class="opn-overlay" *ngIf="visible.length > 0" aria-label="Оперативні повідомлення">
      <article
        class="opn-card"
        *ngFor="let item of visible; trackBy: trackById"
        [class.critical]="item.severity === 'critical'"
        [class.attention]="item.severity === 'attention'"
        [class.info]="item.severity === 'info'"
      >
        <i aria-hidden="true"></i>
        <div class="opn-body">
          <header>
            <strong>{{ item.title }}</strong>
            <time>{{ item.createdAt | date: 'HH:mm:ss' }}</time>
          </header>
          <p>{{ item.message }}</p>
          <footer>
            <button type="button" class="primary" (click)="open(item)">Відкрити</button>
            <button type="button" (click)="acknowledge(item)">
              {{ item.severity === 'critical' ? 'Підтвердити' : 'Закрити' }}
            </button>
          </footer>
        </div>
      </article>

      <button type="button" class="opn-overflow" *ngIf="overflowCount > 0" (click)="openCenter()">
        Ще {{ overflowCount }} подій
      </button>
    </aside>
  `,
  styles: [`
    .opn-overlay {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: var(--z-notifications, 900);
      width: min(360px, calc(100vw - 28px));
      display: grid;
      gap: 8px;
      pointer-events: none;
    }

    .opn-card,
    .opn-overflow {
      pointer-events: auto;
      border: 1px solid rgba(102, 204, 220, 0.32);
      border-radius: 8px;
      background: rgba(4, 17, 23, 0.96);
      color: var(--c2-text, #d8edf3);
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.32);
    }

    .opn-card {
      display: grid;
      grid-template-columns: 8px minmax(0, 1fr);
      overflow: hidden;
    }

    .opn-card > i {
      display: block;
      background: #66ccdc;
    }

    .opn-card.critical > i {
      background: var(--c2-critical, #f05d5e);
    }

    .opn-card.attention > i {
      background: var(--c2-warn, #f2b724);
    }

    .opn-card.info > i {
      background: var(--c2-ok, #22c76a);
    }

    .opn-body {
      min-width: 0;
      display: grid;
      gap: 7px;
      padding: 10px;
    }

    .opn-body header,
    .opn-body footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .opn-body strong {
      font-size: 13px;
      font-weight: 950;
    }

    .opn-body time,
    .opn-body p {
      color: var(--c2-muted, #91a9b0);
      font-size: 11px;
    }

    .opn-body p {
      margin: 0;
      line-height: 1.35;
    }

    .opn-body button,
    .opn-overflow {
      min-height: 28px;
      padding: 0 10px;
      border: 1px solid rgba(102, 204, 220, 0.28);
      border-radius: 6px;
      background: rgba(216, 237, 243, 0.04);
      color: var(--c2-text, #d8edf3);
      font-size: 11px;
      font-weight: 850;
    }

    .opn-body button.primary {
      border-color: rgba(13, 214, 198, 0.46);
      background: rgba(13, 214, 198, 0.12);
    }

    .opn-overflow {
      width: fit-content;
      justify-self: end;
    }
  `],
})
export class OperationalNotificationOverlayComponent implements OnInit, OnDestroy {
  visible: OperationalNotification[] = [];
  private readonly subscriptions = new Subscription();
  private readonly hiddenIds = new Set<string>();
  private lastKey = '';
  private lastKeyAt = 0;
  overflowCount = 0;

  constructor(
    private readonly notifications: OperationalNotificationsService,
    private readonly realtime: RealtimeService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.reconcile();

    this.subscriptions.add(
      this.realtime.watchMany(['events']).subscribe((event) => {
        if (event.entity !== 'operational_notification') {
          return;
        }

        if (event.action === 'created' && event.id) {
          this.loadNew(event.id);
          return;
        }

        if (event.action === 'updated') {
          this.reconcile();
        }
      }),
    );

    this.subscriptions.add(
      this.realtime.watchMany(['all']).subscribe((event) => {
        if (event.entity === 'system' && event.reason === 'reconnect') {
          this.reconcile();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  open(item: OperationalNotification): void {
    this.hiddenIds.add(item.id);
    this.refreshVisible();
    this.notifications.markRead(item.id).subscribe();
    void this.router.navigateByUrl(item.actionUrl || this.routeFor(item));
  }

  acknowledge(item: OperationalNotification): void {
    this.hiddenIds.add(item.id);
    this.refreshVisible();
    this.notifications.acknowledge(item.id).subscribe();
  }

  openCenter(): void {
    void this.router.navigate(['/notifications']);
  }

  trackById(_: number, item: OperationalNotification): string {
    return item.id;
  }

  private reconcile(): void {
    this.notifications.getAll(true).subscribe({
      next: (items) => {
        this.visible = items
          .filter((item) => !this.hiddenIds.has(item.id))
          .slice(0, 3);
        this.overflowCount = Math.max(0, items.length - this.visible.length);
        this.scheduleAutoHide();
      },
    });
  }

  private loadNew(id: string): void {
    this.notifications.getById(id).subscribe({
      next: (item) => {
        const key = `${item.type}|${item.entityType}|${item.entityId}`;
        const now = Date.now();

        if (key === this.lastKey && now - this.lastKeyAt < 2000) {
          return;
        }

        this.lastKey = key;
        this.lastKeyAt = now;
        this.hiddenIds.delete(item.id);
        this.visible = [item, ...this.visible.filter((current) => current.id !== item.id)]
          .filter((current) => !this.hiddenIds.has(current.id))
          .slice(0, 3);
        this.overflowCount = Math.max(0, this.overflowCount);
        this.scheduleAutoHide();
      },
    });
  }

  private scheduleAutoHide(): void {
    for (const item of this.visible) {
      if (item.severity === 'critical') {
        continue;
      }

      const delay = item.severity === 'attention' ? 12000 : 5000;
      this.subscriptions.add(
        timer(delay).subscribe(() => {
          this.hiddenIds.add(item.id);
          this.refreshVisible();
        }),
      );
    }
  }

  private refreshVisible(): void {
    this.visible = this.visible.filter((item) => !this.hiddenIds.has(item.id)).slice(0, 3);
  }

  private routeFor(item: OperationalNotification): string {
    if (item.entityType === 'service_order_delivery') {
      return `/notifications?deliveryId=${item.entityId}`;
    }

    if (item.entityType === 'weapon_system') {
      return `/weapon-systems?weaponId=${item.entityId}`;
    }

    if (item.entityType === 'fire_position') {
      return `/fire-positions?firePositionId=${item.entityId}`;
    }

    return '/notifications';
  }
}
