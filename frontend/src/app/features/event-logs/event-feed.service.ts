import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../features/auth/auth.service';
import { EventLog, EventLogsService } from '../../features/event-logs/event-logs.service';
import { RealtimeService } from '../../core/realtime.service';

export interface EventGroup {
  key: string;
  title: string;
  unitName: string | null;
  eventType: string;
  action: string;
  items: EventLog[];
  open: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class EventFeedService {
  private readonly eventsSubject = new BehaviorSubject<EventLog[]>([]);

  readonly events$ = this.eventsSubject.asObservable();

  snapshot: EventLog[] = [];
  shiftStartedAt = new Date();

  constructor(
    private readonly auth: AuthService,
    private readonly eventLogs: EventLogsService,
    private readonly realtime: RealtimeService,
  ) {
    this.load();

    this.realtime.onEventCreated(() => {
      this.load();
    });
  }

  load(): void {
    const user = this.auth.getUser();

    if (!user || user.role === 'observer') {
      this.snapshot = [];
      this.eventsSubject.next([]);
      return;
    }

    this.eventLogs.getAll().subscribe({
      next: (events) => {
        this.snapshot = events;
        this.eventsSubject.next(events);
      },
      error: () => undefined,
    });
  }

  getGroups(): EventGroup[] {
    const groups = new Map<string, EventGroup>();

    for (const event of this.snapshot) {
      const key = [
        event.eventType,
        event.action,
        event.unitId || 'none',
        event.entityType || 'none',
      ].join('|');

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: event.title,
          unitName: event.unitName,
          eventType: event.eventType,
          action: event.action,
          items: [],
          open: false,
        });
      }

      const group = groups.get(key);
      if (!group) {
        continue;
      }

      group.items.push(event);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: group.items.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      }))
      .sort(
        (a, b) =>
          new Date(b.items[0]?.createdAt || 0).getTime() -
          new Date(a.items[0]?.createdAt || 0).getTime(),
      );
  }
}