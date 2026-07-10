import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EventLog } from '../../event-logs/event-logs.service';
import { EventFeedService, EventGroup } from '../../../core/event-feed.service';

type NotificationTab = 'action' | 'attention' | 'info' | 'journal';
type NotificationTone = 'danger' | 'warning' | 'info' | 'journal';

interface NotificationTabItem {
  key: NotificationTab;
  title: string;
  count: number;
  tone: NotificationTone;
}

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.css',
})
export class NotificationsPage implements OnInit {
  activeTab: NotificationTab = 'action';
  selectedGroupKey: string | null = null;

  constructor(
    readonly eventFeed: EventFeedService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.eventFeed.ensureLoaded();
  }

  get tabs(): NotificationTabItem[] {
    const stats = this.eventFeed.getStats();

    return [
      {
        key: 'action',
        title: 'Потребує дії',
        count: stats.critical,
        tone: 'danger',
      },
      {
        key: 'attention',
        title: 'Потребує уваги',
        count: stats.high,
        tone: 'warning',
      },
      {
        key: 'info',
        title: 'Інформація',
        count: Math.max(0, stats.notifications - stats.critical - stats.high),
        tone: 'info',
      },
      {
        key: 'journal',
        title: 'Журнал',
        count: stats.journal,
        tone: 'journal',
      },
    ];
  }

  get visibleGroups(): EventGroup[] {
    if (this.activeTab === 'journal') {
      return this.eventFeed.getGroups('journal').slice(0, 80);
    }

    const groups = this.eventFeed.getGroups('notifications');

    if (this.activeTab === 'action') {
      return groups.filter((group) => group.priority === 'critical');
    }

    if (this.activeTab === 'attention') {
      return groups.filter((group) => group.priority === 'high');
    }

    return groups.filter((group) => group.priority === 'normal' || group.priority === 'low');
  }

  get selectedGroup(): EventGroup | null {
    const groups = this.visibleGroups;

    return groups.find((group) => group.key === this.selectedGroupKey) || groups[0] || null;
  }

  get selectedEvents(): EventLog[] {
    return this.selectedGroup?.items ?? [];
  }

  get activeTabTitle(): string {
    return this.tabs.find((tab) => tab.key === this.activeTab)?.title || 'Черга';
  }

  get isLoading(): boolean {
    return this.eventFeed.isLoading;
  }

  get errorMessage(): string | null {
    return this.eventFeed.errorMessage;
  }

  setTab(tab: NotificationTab): void {
    this.activeTab = tab;
    this.selectedGroupKey = this.visibleGroups[0]?.key ?? null;
  }

  selectGroup(group: EventGroup): void {
    this.selectedGroupKey = group.key;
  }

  refresh(): void {
    this.eventFeed.load();
  }

  markSeen(): void {
    this.eventFeed.markNotificationsSeen();
  }

  openSelectedGroup(): void {
    const event = this.selectedEvents[0];

    if (event) {
      this.openEvent(event);
    }
  }

  openEvent(event: EventLog): void {
    if (event.eventType === 'service_order') {
      void this.router.navigate(['/service-orders'], {
        queryParams: event.entityId ? { orderId: event.entityId, view: 'list' } : { view: 'list' },
      });
      return;
    }

    if (event.eventType === 'stock') {
      void this.router.navigate(['/stock']);
      return;
    }

    if (event.eventType === 'weapon') {
      void this.router.navigate(['/weapon-systems']);
      return;
    }

    if (event.eventType === 'fire_position') {
      void this.router.navigate(['/fire-positions']);
      return;
    }

    if (event.eventType === 'air_threat') {
      void this.router.navigate(['/map']);
    }
  }

  getPrimaryActionLabel(group: EventGroup | null): string {
    const event = group?.items[0];

    if (!event) {
      return 'Відкрити';
    }

    if (event.eventType === 'service_order') {
      if (event.action === 'created' || event.action === 'rejected') return 'Підібрати ВП';
      if (event.action === 'sent') return 'Перевірити передачу';
      if (event.action === 'accepted' || event.action === 'started') return 'Відкрити ВГЗ';
      return 'Відкрити ВГЗ';
    }

    if (event.eventType === 'stock') return 'Відкрити склад';
    if (event.eventType === 'weapon') return 'Відкрити СГ';
    if (event.eventType === 'fire_position') return 'Відкрити ВП';
    if (event.eventType === 'air_threat') return 'Відкрити карту';

    return 'Відкрити';
  }

  getEventActionLabel(event: EventLog): string {
    if (this.activeTab === 'journal') {
      return this.eventFeed.getEventActionLabel(event);
    }

    if (event.eventType === 'service_order') return 'ВГЗ';
    if (event.eventType === 'stock') return 'БК';
    if (event.eventType === 'weapon') return 'СГ';
    if (event.eventType === 'fire_position') return 'ВП';
    if (event.eventType === 'air_threat') return 'Карта';

    return 'Деталі';
  }

  getPriorityLabel(group: EventGroup): string {
    if (group.priority === 'critical') return 'Дія зараз';
    if (group.priority === 'high') return 'Увага';
    if (group.priority === 'normal') return 'Контроль';

    return 'Інформація';
  }

  getEmptyTitle(): string {
    if (this.activeTab === 'action') return 'Немає термінових дій';
    if (this.activeTab === 'attention') return 'Немає проблем для уваги';
    if (this.activeTab === 'info') return 'Інформаційних подій немає';

    return 'Журнал порожній';
  }

  getEmptyHint(): string {
    if (this.activeTab === 'journal') {
      return 'Події зʼявляться після роботи операторів та системних змін.';
    }

    return 'Коли зʼявиться подія цього типу, вона стане в цю чергу.';
  }

  trackTab(_: number, tab: NotificationTabItem): string {
    return tab.key;
  }

  trackGroup(_: number, group: EventGroup): string {
    return group.key;
  }

  trackEvent(_: number, event: EventLog): string {
    return event.id;
  }
}
