import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';

export interface PlannedRoutePoint {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  isControl: boolean;
  sortOrder?: number;
}

export interface PlannedRoute {
  id: string;
  name: string;
  description: string | null;
  points: PlannedRoutePoint[];
}

export interface PlannedTripCheckpoint extends PlannedRoutePoint {
  id: string;
  passedAt: string | null;
}

export interface PlannedVehicleTrip {
  id: string;
  routeId: string;
  unitId?: string | null;
  vehicleLabel: string;
  driverLabel: string | null;
  startRoutePointId?: string | null;
  endRoutePointId?: string | null;
  destinationEntityType?: 'fire_position' | 'ew_position' | 'air_recon' | null;
  destinationEntityId?: string | null;
  destinationName?: string | null;
  tripPurpose?: string | null;
  plannedStartAt: string | null;
  status: 'planned' | 'active' | 'completed' | 'cancelled' | 'archived';
  createdAt?: string;
  route?: PlannedRoute;
  checkpoints: PlannedTripCheckpoint[];
}

export interface PlannedTripSegmentRequest {
  routeId: string;
  startRoutePointId?: string | null;
  endRoutePointId?: string | null;
}

export interface PlannedTripAnalyticsRow {
  fromName: string;
  toName: string;
  avgMinutes: number;
  samples: number;
}

@Injectable({ providedIn: 'root' })
export class PlannedTripsService {
  constructor(private readonly api: ApiService) {}

  getRoutes(): Observable<PlannedRoute[]> {
    return this.api.get<PlannedRoute[]>('/planned-routes');
  }

  createRoute(body: Partial<PlannedRoute>): Observable<PlannedRoute> {
    return this.api.post<PlannedRoute>('/planned-routes', body);
  }

  updateRoute(id: string, body: Partial<PlannedRoute>): Observable<PlannedRoute> {
    return this.api.patch<PlannedRoute>(`/planned-routes/${id}`, body);
  }

  deleteRoute(id: string): Observable<void> {
    return this.api.delete<void>(`/planned-routes/${id}`);
  }

  getTrips(): Observable<PlannedVehicleTrip[]> {
    return this.api.get<PlannedVehicleTrip[]>('/planned-trips');
  }

  createTrip(body: {
    routeId: string;
    vehicleLabel: string;
    driverLabel?: string | null;
    startRoutePointId?: string | null;
    endRoutePointId?: string | null;
    destinationEntityType?: 'fire_position' | 'ew_position' | 'air_recon' | null;
    destinationEntityId?: string | null;
    destinationName?: string | null;
    destinationLat?: number | null;
    destinationLng?: number | null;
    tripPurpose?: string | null;
    plannedStartAt?: string | null;
    segments?: PlannedTripSegmentRequest[];
  }): Observable<PlannedVehicleTrip> {
    return this.api.post<PlannedVehicleTrip>('/planned-trips', body);
  }

  passCheckpoint(tripId: string, checkpointId: string): Observable<PlannedVehicleTrip> {
    return this.api.post<PlannedVehicleTrip>(
      `/planned-trips/${tripId}/checkpoints/${checkpointId}/pass`,
      {},
    );
  }

  updateTripStatus(tripId: string, status: PlannedVehicleTrip['status']): Observable<PlannedVehicleTrip> {
    return this.api.patch<PlannedVehicleTrip>(`/planned-trips/${tripId}`, { status });
  }

  createReturnTrip(tripId: string): Observable<PlannedVehicleTrip> {
    return this.api.post<PlannedVehicleTrip>(`/planned-trips/${tripId}/return`, {});
  }

  getAnalytics(): Observable<PlannedTripAnalyticsRow[]> {
    return this.api.get<PlannedTripAnalyticsRow[]>('/planned-trips-analytics');
  }
}
