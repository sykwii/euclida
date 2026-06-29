import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Zone } from './zone.model';

export interface CreateZoneRequest {
  weaponModelId: string;
  zoneNumber: number;
  distanceFromM: number;
  distanceToM: number;
}

@Injectable({ providedIn: 'root' })
export class ZonesService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<Zone[]> {
    return this.api.get<Zone[]>('/zones');
  }

  create(body: CreateZoneRequest): Observable<Zone> {
    return this.api.post<Zone>('/zones', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/zones/${id}`);
  }
}