import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RealtimeService } from '../../../core/realtime.service';
import {
  OperationalNotification,
  OperationalNotificationsService,
} from '../operational-notifications.service';

type NotificationTab = 'new' | 'critical' | 'history';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.css',
})
export class NotificationsPage implements OnInit, OnDestroy {
  activeTab: NotificationTab = 'new';
  items: OperationalNotification[] = [];
  isLoading = false;
  errorMessage: string | null = null;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly notifications: OperationalNotificationsService,
    private readonly realtime: RealtimeService,
    private readonly router: Router,
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
    if (this.activeTab === 'critical') {
      return this.items.filter((item) => item.severity === 'critical' && !item.acknowledgedAt);
    }

    if (this.activeTab === 'history') {
      return this.items;
    }

    return this.items.filter((item) => !item.readAt);
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
    this.notifications.getAll(false).subscribe({
      next: (items) => {
        this.items = items;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Не вдалося завантажити оперативні повідомлення.';
        this.isLoading = false;
      },
    });
  }

  setTab(tab: NotificationTab): void {
    this.activeTab = tab;
  }

  open(item: OperationalNotification): void {
    this.notifications.markRead(item.id).subscribe();
    void this.router.navigateByUrl(item.actionUrl || this.routeFor(item));
  }

  acknowledge(item: OperationalNotification): void {
    this.notifications.acknowledge(item.id).subscribe({
      next: (updated) => {
        this.items = this.items.map((current) => current.id === updated.id ? updated : current);
      },
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
    return 'Інформація';
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

  trackById(_: number, item: OperationalNotification): string {
    return item.id;
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
