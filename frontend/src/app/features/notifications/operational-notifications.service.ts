import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';

export type OperationalNotificationType =
  | 'new_target'
  | 'weapon_not_ready'
  | 'weapon_ready'
  | 'fire_position_not_ready'
  | 'fire_position_ready'
  | 'target_accepted'
  | 'target_rejected'
  | 'firing_blocked';

export type OperationalNotificationSeverity = 'critical' | 'attention' | 'info';

export interface OperationalNotification {
  id: string;
  recipientUserId: string | null;
  recipientUnitId: string | null;
  recipientLevel: string | null;
  type: OperationalNotificationType;
  severity: OperationalNotificationSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  actionUrl: string | null;
  sourceEventKey: string;
  createdAt: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  actorUserId: string | null;
  payload: Record<string, unknown>;
}

export interface OperationalNotificationCount {
  unread: number;
  critical: number;
}

@Injectable({ providedIn: 'root' })
export class OperationalNotificationsService {
  constructor(private readonly api: ApiService) {}

  getAll(unread = false): Observable<OperationalNotification[]> {
    return this.api.get<OperationalNotification[]>(
      `/operational-notifications${unread ? '?unread=true' : ''}`,
    );
  }

  getById(id: string): Observable<OperationalNotification> {
    return this.api.get<OperationalNotification>(`/operational-notifications/${id}`);
  }

  getCount(): Observable<OperationalNotificationCount> {
    return this.api.get<OperationalNotificationCount>('/operational-notifications/count');
  }

  markRead(id: string): Observable<OperationalNotification> {
    return this.api.post<OperationalNotification>(`/operational-notifications/${id}/read`, {});
  }

  acknowledge(id: string): Observable<OperationalNotification> {
    return this.api.post<OperationalNotification>(
      `/operational-notifications/${id}/acknowledge`,
      {},
    );
  }

  readAll(): Observable<{ updated: number }> {
    return this.api.post<{ updated: number }>('/operational-notifications/read-all', {});
  }
}
