import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Depot } from './depot.model';

export interface CreateDepotRequest {
  name: string;
  depotType: string;
  unitId?: string;
  parentId?: string;
  lat?: number;
  lng?: number;
  mgrs?: string;
}

@Injectable({
  providedIn: 'root',
})
export class DepotsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<Depot[]> {
    return this.api.get<Depot[]>('/depots');
  }

  create(body: CreateDepotRequest): Observable<Depot> {
    return this.api.post<Depot>('/depots', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/depots/${id}`);
  }
}