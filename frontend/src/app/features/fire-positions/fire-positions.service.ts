import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FirePosition } from './fire-position.model';
import { FirePositionCard } from './fire-position-card.model';


export interface CreateFirePositionRequest {
  name: string;
  unitId?: string;
positionType?: 'fire_position' | 'aerial_recon' | 'ew_post' | 'ew_station' | 'air_asset_crew';
  lat?: number;
  lng?: number;
  mgrs?: string;

  mainDirectionUnits?: number;
  traverseLeftUnits?: number;
  traverseRightUnits?: number;

  hasSg?: boolean;
  readinessStatus?: string;
  notReadyReason?: string;
  completedVgzCount?: number;
  personnelRotationStatus?: string;
  airSituationStatus?: string;
}

@Injectable({
  providedIn: 'root',
})
export class FirePositionsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<FirePosition[]> {
    return this.api.get<FirePosition[]>('/fire-positions');
  }

  create(body: CreateFirePositionRequest): Observable<FirePosition> {
    return this.api.post<FirePosition>('/fire-positions', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/fire-positions/${id}`);
  }
  getOne(id: string): Observable<FirePosition> {
  return this.api.get<FirePosition>(`/fire-positions/${id}`);
}

update(id: string, body: Partial<CreateFirePositionRequest>): Observable<FirePosition> {
  return this.api.patch<FirePosition>(`/fire-positions/${id}`, body);
}
getCard(id: string): Observable<FirePositionCard> {
  return this.api.get<FirePositionCard>(`/fire-positions/${id}/card`);
}
getAllForMap(): Observable<FirePosition[]> {
  return this.api.get<FirePosition[]>('/fire-positions/map');
}

confirmReadiness(id: string): Observable<FirePosition> {
  return this.api.post<FirePosition>(`/fire-positions/${id}/readiness/confirm`, {});
}

setNotReady(
  id: string,
  body: { notReadyReason: 'threat' | 'damaged' | 'prohibited' | 'other'; note?: string },
): Observable<FirePosition> {
  return this.api.post<FirePosition>(`/fire-positions/${id}/readiness/not-ready`, body);
}
}
