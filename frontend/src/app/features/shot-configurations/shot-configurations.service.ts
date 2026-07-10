import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ShotConfiguration } from './shot-configuration.model';

export interface ShotConfigurationChargeRequest {
  chargeId: string;
  quantityPerShot: number;
  sortOrder?: number;
}

export interface SaveShotConfigurationRequest {
  name: string;
  weaponModelId: string;
  shellId: string;
  fuzeId?: string | null;
  primerId?: string | null;
  zoneId?: string | null;
  maxRangeM: number;
  isActive?: boolean;
  note?: string | null;
  charges: ShotConfigurationChargeRequest[];
}

@Injectable({ providedIn: 'root' })
export class ShotConfigurationsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<ShotConfiguration[]> {
    return this.api.get<ShotConfiguration[]>('/shot-configurations');
  }

  create(body: SaveShotConfigurationRequest): Observable<ShotConfiguration> {
    return this.api.post<ShotConfiguration>('/shot-configurations', body);
  }

  update(
    id: string,
    body: Partial<SaveShotConfigurationRequest>,
  ): Observable<ShotConfiguration> {
    return this.api.patch<ShotConfiguration>(`/shot-configurations/${id}`, body);
  }

  activate(id: string, isActive: boolean): Observable<ShotConfiguration> {
    return this.api.post<ShotConfiguration>(`/shot-configurations/${id}/activate`, {
      isActive,
    });
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/shot-configurations/${id}`);
  }
}
