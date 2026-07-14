import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { WeaponSystem } from './weapon-system.model';

export interface CreateWeaponSystemRequest {
  weaponModelId: string;
  serialNumber?: string;
  callsign?: string;
  unitId?: string;
  readinessStatus?: string;
  notReadyReason?: string;
  locationType?: string;
  firePositionId?: string | null;
  deploymentStatus?: string;
  currentFirePositionId?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class WeaponSystemsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<WeaponSystem[]> {
    return this.api.get<WeaponSystem[]>('/weapon-systems');
  }

  create(body: CreateWeaponSystemRequest): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>('/weapon-systems', body);
  }

  update(id: string, body: Partial<CreateWeaponSystemRequest>): Observable<WeaponSystem> {
    return this.api.patch<WeaponSystem>(`/weapon-systems/${id}`, body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/weapon-systems/${id}`);
  }

  moveToReserve(id: string): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/move-to-reserve`, {});
  }

  /** @deprecated Active UI uses the canonical planned deployment flow. */
  assignToFirePosition(
    id: string,
    targetFirePositionId: string | null,
    unitId?: string,
    force = false,
  ): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/assign-to-fire-position`, {
      targetFirePositionId,
      unitId,
      force,
    });
  }

  planMoveToFirePosition(
    id: string,
    body: { targetFirePositionId: string; force?: boolean; note?: string },
  ): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/deployment/assign`, body);
  }

  startMoveToFirePosition(
    id: string,
    body: { targetFirePositionId?: string; force?: boolean; note?: string } = {},
  ): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(
      `/weapon-systems/${id}/deployment/start-to-fire-position`,
      body,
    );
  }

  confirmFirePositionArrival(
    id: string,
    body: { targetFirePositionId?: string; force?: boolean; note?: string } = {},
  ): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(
      `/weapon-systems/${id}/deployment/confirm-fire-position-arrival`,
      body,
    );
  }

  planMoveToReserve(id: string, body: { note?: string } = {}): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/deployment/withdraw`, body);
  }

  startMoveToReserve(id: string, body: { note?: string } = {}): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/deployment/start-to-reserve`, body);
  }

  confirmReserveArrival(id: string, body: { note?: string } = {}): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(
      `/weapon-systems/${id}/deployment/confirm-reserve-arrival`,
      body,
    );
  }

  cancelDeployment(id: string): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/deployment/cancel`, {});
  }

  syncFirePositionStates(): Observable<{ updated: number }> {
    return this.api.post<{ updated: number }>(`/weapon-systems/sync-fire-position-states`, {});
  }

  requestMaintenance(
    id: string,
    body: { requestedStartAt?: string; durationMinutes: number; note?: string },
  ): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/maintenance/request`, body);
  }

  approveMaintenance(id: string): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/maintenance/approve`, {});
  }

  startMaintenance(id: string): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/maintenance/start`, {});
  }

  rejectMaintenance(id: string): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/maintenance/reject`, {});
  }

  cancelMaintenance(id: string): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/maintenance/cancel`, {});
  }

  extendMaintenance(id: string, body: { extraMinutes: number; note?: string }): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/maintenance/extend`, body);
  }

  finishMaintenance(id: string): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/maintenance/finish`, {});
  }

  openMaintenance(
    id: string,
    body: {
      reason?: 'breakdown' | 'scheduled' | 'inspection' | 'other';
      startedAt?: string;
      expectedCompletedAt?: string;
      durationMinutes?: number;
      description?: string;
    },
  ): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/maintenance/open`, body);
  }

  completeMaintenance(id: string, body: { result?: string } = {}): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/maintenance/complete`, body);
  }

  confirmReadiness(
    id: string,
    body: {
      readinessStatus: 'combat_ready' | 'not_combat_ready';
      notReadyReason?: 'breakdown' | 'threat' | 'crew' | 'maintenance' | 'other' | null;
      note?: string;
    },
  ): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/readiness/confirm`, body);
  }
}
