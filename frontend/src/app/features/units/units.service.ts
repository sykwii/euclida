import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Unit } from './unit.model';

export interface UnitPayload {
  name: string;
  type: string;
  parentId?: string | null;
  sortOrder?: number;
}

@Injectable({
  providedIn: 'root',
})
export class UnitsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<Unit[]> {
    return this.api.get<Unit[]>('/units');
  }

  create(payload: UnitPayload): Observable<Unit> {
    return this.api.post<Unit>('/units', payload);
  }

  update(id: string, payload: UnitPayload): Observable<Unit> {
    return this.api.patch<Unit>(`/units/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/units/${id}`);
  }

  deleteWithRelated(id: string): Observable<void> {
    return this.api.delete<void>(`/units/${id}/with-related`);
  }
}
