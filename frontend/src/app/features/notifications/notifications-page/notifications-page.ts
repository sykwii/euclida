import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RealtimeService } from '../../../core/realtime.service';
import {
  OperationalNotification,
  OperationalNotificationsService,
} from '../operational-notifications.service';

type NotificationTab = 'new' | 'critical' | 'history';
type NotificationFilter = 'all' | 'targets' | 'weapons' | 'fire_positions';

interface NotificationDayGroup {
  key: string;
  title: string;
  items: OperationalNotification[];
}

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.css',
})
export class NotificationsPage implements OnInit, OnDestroy {
  activeTab: NotificationTab = 'new';
  activeFilter: NotificationFilter = 'all';
  items: OperationalNotification[] = [];
  isLoading = false;
  errorMessage: string | null = null;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly notifications: OperationalNotificationsService,
    private readonly realtime: RealtimeService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
    this.subscriptions.add(
      this.realtime.watchMany(['events']).subscribe((event) => {
        if (event.entity === 'operational_notification') {
          this.load();
        }
      }),
    );
    this.subscriptions.add(
      this.realtime.watchMany(['all']).subscribe((event) => {
        if (event.entity === 'system' && event.reason === 'reconnect') {
          this.load();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get visibleItems(): OperationalNotification[] {
    const byTab = this.items.filter((item) => {
      if (this.activeTab === 'critical') {
        return item.severity === 'critical' && !item.acknowledgedAt;
      }

      if (this.activeTab === 'history') {
        return true;
      }

      return !item.readAt;
    });

    if (this.activeFilter === 'targets') {
      return byTab.filter((item) => item.type === 'new_target' || item.type.startsWith('target_'));
    }

    if (this.activeFilter === 'weapons') {
      return byTab.filter((item) => item.type.startsWith('weapon_'));
    }

    if (this.activeFilter === 'fire_positions') {
      return byTab.filter((item) => item.type.startsWith('fire_position_'));
    }

    return byTab;
  }

  get groupedItems(): NotificationDayGroup[] {
    const groups: Record<string, NotificationDayGroup> = {
      today: { key: 'today', title: 'Сьогодні', items: [] },
      yesterday: { key: 'yesterday', title: 'Вчора', items: [] },
      earlier: { key: 'earlier', title: 'Раніше', items: [] },
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 24 * 60 * 60 * 1000;

    for (const item of this.visibleItems) {
      const created = new Date(item.createdAt).getTime();

      if (created >= today) {
        groups['today'].items.push(item);
      } else if (created >= yesterday) {
        groups['yesterday'].items.push(item);
      } else {
        groups['earlier'].items.push(item);
      }
    }

    return Object.values(groups).filter((group) => group.items.length > 0);
  }

  get newCount(): number {
    return this.items.filter((item) => !item.readAt).length;
  }

  get criticalCount(): number {
    return this.items.filter((item) => item.severity === 'critical' && !item.acknowledgedAt).length;
  }

  load(): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    this.notifications.getAll(false).subscribe({
      next: (items) => {
        this.items = items;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMessage = 'Не вдалося завантажити оперативні повідомлення.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  setTab(tab: NotificationTab): void {
    this.activeTab = tab;
  }

  setFilter(filter: NotificationFilter): void {
    this.activeFilter = filter;
  }

  open(item: OperationalNotification): void {
    this.notifications.markRead(item.id).subscribe({
      next: (updated) => this.replaceItem(updated),
    });
    void this.router.navigateByUrl(item.actionUrl || this.routeFor(item));
  }

  acknowledge(item: OperationalNotification, event?: Event): void {
    event?.stopPropagation();
    this.notifications.acknowledge(item.id).subscribe({
      next: (updated) => this.replaceItem(updated),
    });
  }

  read(item: OperationalNotification, event?: Event): void {
    event?.stopPropagation();
    this.notifications.markRead(item.id).subscribe({
      next: (updated) => this.replaceItem(updated),
    });
  }

  readAll(): void {
    this.notifications.readAll().subscribe({
      next: () => this.load(),
    });
  }

  getSeverityLabel(item: OperationalNotification): string {
    if (item.severity === 'critical') return 'Критично';
    if (item.severity === 'attention') return 'Увага';
    return 'Інфо';
  }

  getTypeLabel(item: OperationalNotification): string {
    const labels: Record<string, string> = {
      new_target: 'Нова ціль',
      weapon_not_ready: 'СГ НЕ БГ',
      weapon_ready: 'СГ БГ',
      fire_position_not_ready: 'ВП НЕ БГ',
      fire_position_ready: 'ВП БГ',
      target_accepted: 'Ціль прийнято',
      target_rejected: 'Ціль відхилено',
      firing_blocked: 'Вогонь заблоковано',
    };

    return labels[item.type] ?? 'Повідомлення';
  }

  titleLine(item: OperationalNotification): string {
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
    const parts = [
      this.reasonLabel(this.stringValue(payload['reason'])),
      this.stringValue(payload['firePositionName']) && !item.type.startsWith('fire_position_')
        ? `ВП "${this.stringValue(payload['firePositionName'])}"`
        : '',
      this.stringValue(payload['assignedWeaponName'])
        ? `СГ "${this.stringValue(payload['assignedWeaponName'])}"`
        : '',
      this.stringValue(payload['targetMgrs']) || this.stringValue(payload['mgrs']),
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' · ') : item.message;
  }

  trackGroup(_: number, group: NotificationDayGroup): string {
    return group.key;
  }

  trackById(_: number, item: OperationalNotification): string {
    return item.id;
  }

  private replaceItem(updated: OperationalNotification): void {
    this.items = this.items.map((item) => item.id === updated.id ? updated : item);
    this.cdr.markForCheck();
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

  private stringValue(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }
}
