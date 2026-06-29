import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { WeaponModel } from './weapon-model.model';

export interface CreateWeaponModelRequest {
  name: string;
  systemType: string;
  zonesCount: number;
}

@Injectable({ providedIn: 'root' })
export class WeaponModelsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<WeaponModel[]> {
    return this.api.get<WeaponModel[]>('/weapon-models');
  }

  create(body: CreateWeaponModelRequest): Observable<WeaponModel> {
    return this.api.post<WeaponModel>('/weapon-models', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/weapon-models/${id}`);
  }
}