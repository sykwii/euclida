import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ShellCompatibleCharge } from './shell-compatible-charge.model';

export interface CreateShellCompatibleChargeRequest {
  shellId: string;
  chargeId: string;
  maxRangeM: number;
}

@Injectable({ providedIn: 'root' })
export class ShellCompatibleChargesService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<ShellCompatibleCharge[]> {
    return this.api.get<ShellCompatibleCharge[]>('/shell-compatible-charges');
  }

  create(body: CreateShellCompatibleChargeRequest): Observable<ShellCompatibleCharge> {
    return this.api.post<ShellCompatibleCharge>('/shell-compatible-charges', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/shell-compatible-charges/${id}`);
  }
}