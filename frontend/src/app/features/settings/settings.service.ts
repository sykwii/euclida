import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';

export interface AirThreatRadiusResponse {
  radiusM: number;
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  constructor(private readonly api: ApiService) {}

  getAirThreatRadius(): Observable<AirThreatRadiusResponse> {
    return this.api.get<AirThreatRadiusResponse>('/settings/air-threat-radius');
  }

  updateAirThreatRadius(radiusM: number): Observable<AirThreatRadiusResponse> {
    return this.api.patch<AirThreatRadiusResponse>('/settings/air-threat-radius', {
      radiusM,
    });
  }
}