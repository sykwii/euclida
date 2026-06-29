import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Primer } from './primer.model';

export interface CreatePrimerRequest {
  marking: string;
  ammoType?: string;
}

@Injectable({ providedIn: 'root' })
export class PrimersService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<Primer[]> {
    return this.api.get<Primer[]>('/primers');
  }

  create(body: CreatePrimerRequest): Observable<Primer> {
    return this.api.post<Primer>('/primers', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/primers/${id}`);
  }
}