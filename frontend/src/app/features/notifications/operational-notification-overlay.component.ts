import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { RealtimeService } from '../../core/realtime.service';
import { AuthService } from '../auth/auth.service';
import {
  OperationalNotification,
  OperationalNotificationsService,
} from './operational-notifications.service';

interface OverlayCard {
  item: OperationalNotification;
  stackCount: number;
}

@Component({
  selector: 'app-operational-notification-overlay',
  standalone: true,
  imports: [CommonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="opn-overlay" *ngIf="visible.length > 0" aria-label="Оперативні повідомлення">
      <article
        class="opn-card"
        *ngFor="let card of visible; trackBy: trackByCard"
        [class.critical]="card.item.severity === 'critical'"
        [class.attention]="card.item.severity === 'attention'"
        [class.info]="card.item.severity === 'info'"
        tabindex="0"
        role="button"
        [attr.aria-label]="cardTitle(card)"
        (click)="open(card.item)"
        (keydown.enter)="open(card.item)"
        (keydown.space)="open(card.item); $event.preventDefault()"
      >
        <i class="opn-severity" aria-hidden="true"></i>
        <div class="opn-body">
          <header>
            <strong>{{ typeLabel(card.item) }}</strong>
            <span *ngIf="card.stackCount > 1">×{{ card.stackCount }}</span>
            <time>{{ card.item.createdAt | date: 'HH:mm' }}</time>
          </header>

          <b>{{ entityLine(card.item) }}</b>
          <p *ngIf="contextLine(card.item)">{{ contextLine(card.item) }}</p>

          <footer>
            <button type="button" class="opn-primary" (click)="open(card.item); $event.stopPropagation()">
              Відкрити
            </button>
            <button
              type="button"
              class="opn-ack"
              [attr.aria-label]="card.item.severity === 'critical' ? 'Підтвердити' : 'Закрити'"
              [title]="card.item.severity === 'critical' ? 'Підтвердити' : 'Закрити'"
              (click)="acknowledge(card.item); $event.stopPropagation()"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
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
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      right: calc(env(safe-area-inset-right, 0px) + 12px);
      z-index: var(--z-notifications, 900);
      width: clamp(340px, 25vw, 380px);
      display: grid;
      gap: 8px;
      pointer-events: none;
    }

    .opn-card,
    .opn-overflow {
      pointer-events: auto;
      border: 1px solid rgba(102, 204, 220, 0.22);
      border-radius: 7px;
      background: rgba(4, 17, 23, 0.96);
      color: var(--c2-text, #d8edf3);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
    }

    .opn-card {
      display: grid;
      grid-template-columns: 3px minmax(0, 1fr);
      min-height: 86px;
      overflow: hidden;
      cursor: pointer;
      outline: none;
    }

    .opn-card:focus-visible {
      border-color: rgba(13, 214, 198, 0.58);
      background: rgba(7, 26, 33, 0.98);
    }

    .opn-card:hover {
      background: rgba(7, 26, 33, 0.98);
    }

    .opn-severity {
      display: block;
      background: #4fd1c5;
    }

    .opn-card.critical {
      border-color: rgba(240, 93, 94, 0.42);
    }

    .opn-card.critical .opn-severity {
      background: #f05d5e;
    }

    .opn-card.attention .opn-severity {
      background: #f2b724;
    }

    .opn-card.info .opn-severity {
      background: #22c76a;
    }

    .opn-body {
      min-width: 0;
      display: grid;
      gap: 5px;
      padding: 9px 10px;
    }

    .opn-body header,
    .opn-body footer {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }

    .opn-body header strong {
      min-width: 0;
      color: var(--c2-text, #d8edf3);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .opn-body header span {
      display: inline-grid;
      min-width: 24px;
      height: 18px;
      place-items: center;
      border: 1px solid rgba(216, 237, 243, 0.16);
      border-radius: 999px;
      color: var(--c2-muted, #91a9b0);
      font-size: 10px;
      font-weight: 900;
    }

    .opn-body time {
      margin-left: auto;
      color: var(--c2-muted, #91a9b0);
      font-size: 10px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .opn-body b {
      min-width: 0;
      color: var(--c2-text, #d8edf3);
      font-size: 13px;
      font-weight: 850;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .opn-body p {
      display: -webkit-box;
      margin: 0;
      color: var(--c2-muted, #91a9b0);
      font-size: 12px;
      line-height: 1.32;
      overflow: hidden;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .opn-body footer {
      justify-content: flex-end;
      min-height: 28px;
    }

    .opn-primary,
    .opn-ack,
    .opn-overflow {
      min-height: 26px;
      border: 1px solid rgba(102, 204, 220, 0.24);
      border-radius: 6px;
      background: rgba(216, 237, 243, 0.035);
      color: var(--c2-text, #d8edf3);
      font-size: 11px;
      font-weight: 850;
    }

    .opn-primary {
      padding: 0 10px;
      border-color: rgba(13, 214, 198, 0.4);
      background: rgba(13, 214, 198, 0.1);
    }

    .opn-ack {
      width: 28px;
      padding: 0;
      display: grid;
      place-items: center;
    }

    .opn-ack svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }

    .opn-primary:focus-visible,
    .opn-ack:focus-visible,
    .opn-overflow:focus-visible {
      outline: 2px solid rgba(13, 214, 198, 0.5);
      outline-offset: 2px;
    }

    .opn-overflow {
      width: fit-content;
      justify-self: end;
      padding: 0 10px;
      color: var(--c2-muted, #91a9b0);
    }

    @media (max-width: 720px) {
      .opn-overlay {
        top: calc(env(safe-area-inset-top, 0px) + 8px);
        left: 8px;
        right: 8px;
        width: auto;
      }
    }
  `],
})
export class OperationalNotificationOverlayComponent implements OnInit, OnDestroy {
  visible: OverlayCard[] = [];
  overflowCount = 0;

  private readonly subscriptions = new Subscription();
  private readonly hiddenIds = new Set<string>();
  private readonly expiredIds = new Set<string>();
  private readonly stackCounts = new Map<string, number>();
  private allUnread: OperationalNotification[] = [];
  private lastKey = '';
  private lastKeyAt = 0;

  constructor(
    private readonly notifications: OperationalNotificationsService,
    private readonly realtime: RealtimeService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
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

  @HostListener('document:keydown.escape')
  closeTransient(): void {
    const transient = this.visible.find((card) => card.item.severity !== 'critical');

    if (!transient) {
      return;
    }

    this.hiddenIds.add(transient.item.id);
    this.refreshVisible();
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

  trackByCard(_: number, card: OverlayCard): string {
    return card.item.id;
  }

  cardTitle(card: OverlayCard): string {
    return `${this.typeLabel(card.item)} ${this.entityLine(card.item)}`;
  }

  typeLabel(item: OperationalNotification): string {
    const labels: Record<string, string> = {
      new_target: 'Нова ціль',
      weapon_not_ready: 'СГ → НЕ БГ',
      weapon_ready: 'СГ → БГ',
      fire_position_not_ready: 'ВП → НЕ БГ',
      fire_position_ready: 'ВП → БГ',
      target_accepted: 'Ціль прийнято',
      target_rejected: 'Ціль відхилено',
      firing_blocked: 'Вогонь заблоковано',
    };

    return labels[item.type] ?? 'Повідомлення';
  }

  entityLine(item: OperationalNotification): string {
    const payload = item.payload || {};
    const name = this.stringValue(payload['callsign'])
      || this.stringValue(payload['firePositionName'])
      || this.stringValue(payload['orderNumber']);

    if (item.type === 'new_target') {
      return name ? `ВГЗ ${name}` : item.title;
    }

    if (item.type.startsWith('weapon_')) {
      return name ? `СГ "${name}"` : item.title;
    }

    if (item.type.startsWith('fire_position_')) {
      return name ? `ВП "${name}"` : item.title;
    }

    return item.title;
  }

  contextLine(item: OperationalNotification): string {
    const payload = item.payload || {};
    const parts: string[] = [];
    const reason = this.reasonLabel(this.stringValue(payload['reason']));
    const fpName = this.stringValue(payload['firePositionName']);
    const assignedWeapon = this.stringValue(payload['assignedWeaponName']);
    const mgrs = this.stringValue(payload['targetMgrs']) || this.stringValue(payload['mgrs']);

    if (reason) {
      parts.push(reason);
    }

    if (fpName && !item.type.startsWith('fire_position_')) {
      parts.push(`ВП "${fpName}"`);
    }

    if (assignedWeapon) {
      parts.push(`СГ "${assignedWeapon}"`);
    }

    if (mgrs) {
      parts.push(mgrs);
    }

    return parts.length > 0 ? parts.join(' · ') : this.truncate(item.message);
  }

  private reconcile(): void {
    if (!this.auth.isLoggedIn()) {
      this.allUnread = [];
      this.refreshVisible();
      return;
    }

    this.notifications.getAll(true).subscribe({
      next: (items) => {
        this.allUnread = items.filter((item) => !this.expiredIds.has(item.id));
        const first = this.allUnread[0];
        if (first) {
          this.lastKey = this.stackKey(first);
          this.lastKeyAt = Date.now();
        }
        this.refreshVisible();
      },
      error: () => {
        this.allUnread = [];
        this.refreshVisible();
      },
    });
  }

  private loadNew(id: string): void {
    this.notifications.getById(id).subscribe({
      next: (item) => {
        const key = this.stackKey(item);
        const now = Date.now();

        if (key === this.lastKey && now - this.lastKeyAt < 2000) {
          this.stackCounts.set(key, (this.stackCounts.get(key) ?? 1) + 1);
          this.refreshVisible();
          return;
        }

        this.lastKey = key;
        this.lastKeyAt = now;
        this.hiddenIds.delete(item.id);
        this.expiredIds.delete(item.id);
        this.allUnread = [item, ...this.allUnread.filter((current) => current.id !== item.id)];
        this.refreshVisible();
      },
    });
  }

  private scheduleAutoHide(item: OperationalNotification): void {
    if (item.severity === 'critical') {
      return;
    }

    const delay = item.severity === 'attention' ? 12000 : 5000;
    this.subscriptions.add(
      timer(delay).subscribe(() => {
        this.expiredIds.add(item.id);
        this.hiddenIds.add(item.id);
        this.refreshVisible();
      }),
    );
  }

  private refreshVisible(): void {
    const available = this.allUnread.filter((item) => !this.hiddenIds.has(item.id));
    this.visible = available.slice(0, 3).map((item) => ({
      item,
      stackCount: this.stackCounts.get(this.stackKey(item)) ?? 1,
    }));
    this.overflowCount = Math.max(0, available.length - this.visible.length);
    this.visible.forEach((card) => this.scheduleAutoHide(card.item));
    this.cdr.markForCheck();
  }

  private stackKey(item: OperationalNotification): string {
    return `${item.type}|${item.entityType}|${item.entityId}`;
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

  private reasonLabel(value: string): string {
    const labels: Record<string, string> = {
      breakdown: 'Поломка',
      threat: 'Загроза',
      crew: 'Екіпаж',
      maintenance: 'ТО/ремонт',
      damaged: 'Пошкоджена',
      not_prepared: 'Не підготовлена',
      occupied: 'Зайнята',
      other: 'Інше',
    };

    return labels[value] ?? '';
  }

  private truncate(value: string): string {
    return value.length > 140 ? `${value.slice(0, 137)}...` : value;
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }
}
