import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';

export interface EventLogFilters {
  eventType?: string;
  action?: string;
  entityType?: string;
  q?: string;
  limit?: number;
}

export interface EventLog {
  id: string;

  eventType: string;
  action: string;

  actorUserId: string | null;
  actorLogin: string | null;
  actorName: string | null;
  actorRole: string | null;
  actorScope: string | null;

  unitId: string | null;
  unitName: string | null;

  entityType: string | null;
  entityId: string | null;
  entityName: string | null;

  title: string;
  details: string | null;
  metadata: Record<string, unknown> | null;

  readAt: string | null;
  createdAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class EventLogsService {
  constructor(private readonly api: ApiService) {}

  getAll(filters: EventLogFilters = {}) {
    const params = new URLSearchParams();

    if (filters.eventType) params.set('eventType', filters.eventType);
    if (filters.action) params.set('action', filters.action);
    if (filters.entityType) params.set('entityType', filters.entityType);
    if (filters.q) params.set('q', filters.q);
    if (filters.limit) params.set('limit', String(filters.limit));

    const query = params.toString();

    return this.api.get<EventLog[]>(`/event-logs${query ? `?${query}` : ''}`);
  }

  markRead(ids?: string[]) {
    return this.api.post<{ updated: number }>('/event-logs/mark-read', { ids });
  }
}
