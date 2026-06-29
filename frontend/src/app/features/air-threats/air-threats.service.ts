import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AirThreat } from './air-threat.model';

export interface CreateAirThreatRequest {
  threatType: string;
  lat: number;
  lng: number;
}

@Injectable({ providedIn: 'root' })
export class AirThreatsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<AirThreat[]> {
    return this.api.get<AirThreat[]>('/air-threats');
  }

  create(body: CreateAirThreatRequest): Observable<AirThreat> {
    return this.api.post<AirThreat>('/air-threats', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/air-threats/${id}`);
  }
}