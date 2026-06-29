import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Charge } from './charge.model';

export interface CreateChargeRequest {
  marking: string;
  packagingType: string;
  measurementUnit: string;
  chargeKind?: 'unit' | 'modular';
  modulesPerCharge?: number | null;
  maxUsableModules?: number | null;
  moduleNote?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ChargesService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<Charge[]> {
    return this.api.get<Charge[]>('/charges');
  }

  create(body: CreateChargeRequest): Observable<Charge> {
    return this.api.post<Charge>('/charges', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/charges/${id}`);
  }
}