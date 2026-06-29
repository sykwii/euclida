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

  assignToFirePosition(id: string, targetFirePositionId: string | null, unitId?: string): Observable<WeaponSystem> {
    return this.api.post<WeaponSystem>(`/weapon-systems/${id}/assign-to-fire-position`, { targetFirePositionId, unitId });
  }

  syncFirePositionStates(): Observable<{ updated: number }> {
    return this.api.post<{ updated: number }>(`/weapon-systems/sync-fire-position-states`, {});
  }
}
