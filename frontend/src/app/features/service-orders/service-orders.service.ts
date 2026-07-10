import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ServiceOrder, ServiceOrderAssignedScope } from './service-order.model';
import { ServiceOrderMapResult } from './service-order-map-result.model';

export interface CompleteServiceOrderRequest {
  startedAt: string;
  completedAt: string;
  resultType: string;
  resultComment?: string;
  actualQuantity: number;
  actualShellId?: string;
  actualChargeId?: string;
  chargeModulesPerShot?: number;
  actualAmmoItems?: Array<{
    shellId: string;
    chargeId: string;
    quantity: number;
    chargeModulesPerShot?: number;
  }>;
}




export interface CreateServiceOrderRequest {
  targetLat?: number;
  targetLng?: number;
  targetMgrs?: string;
  targetSettlement?: string;
  taskType: string;
  plannedQuantity?: number;
  orderNumber: string;
}

export interface SendServiceOrderRequest {
  assignedScope?: ServiceOrderAssignedScope;
  assignedUnitId?: string;
}

export interface ServiceOrderSuggestionVariant {
  shellId: string;
  chargeId: string;
  zoneId: string | null;
  maxRangeM: number;
  rangeReserveM: number;
  availableQuantity: number;
  priority: number;

  shell: {
    id: string;
    marking: string;
  };

  charge: {
    id: string;
    marking: string;
  };

  zone: {
    id: string;
    zoneNumber: number;
    distanceFromM: number;
    distanceToM: number;
  } | null;
}

export interface ServiceOrderAirPayloadVariant {
  droneModelId: string;
  warheadTypeId: string;
  maxRangeM: number;
  rangeReserveM: number;
  availableQuantity: number;
  priority: number;

  droneModel?: {
    id: string;
    name: string;
    droneGroup?: string | null;
    droneType?: string | null;
    cameraType?: string | null;
    maxRangeM?: number | null;
    cruiseSpeedKmh?: number | null;
    enduranceMinutes?: number | null;
    payloadCapacityKg?: number | null;
    maxAltitudeM?: number | null;
    maxWindMs?: number | null;
    note?: string | null;
  };

  warheadType?: {
    id: string;
    name: string;
    weightKg?: number | null;
    measureUnit?: 'unit' | 'kg';
    note?: string | null;
  };
}

export interface ServiceOrderSuggestion {
  executorType: 'fire_position' | 'air_asset_position';

  firePosition?: {
    id: string;
    name: string;
    readinessStatus: string;
    completedVgzCount: number;
    unitId?: string | null;
    unit?: {
      id: string;
      name: string;
      type?: string | null;
      parentId?: string | null;
    } | null;
  };

  airAssetPosition?: {
    id: string;
    name: string;
    callsign: string;
    assetGroup?: 'recon' | 'combat' | string;
    reconType?: string | null;
    combatType?: string | null;
    readinessStatus: string;
    unitId?: string | null;
    unit?: {
      id: string;
      name: string;
      type?: string | null;
      parentId?: string | null;
    } | null;
    lat?: number;
    lng?: number;
    mgrs?: string | null;
    sectorLeftDegrees?: number | null;
    sectorRightDegrees?: number | null;
    maxSectorDistanceM?: number | null;
  };

  distanceM: number;
  completedVgzCount: number;
  variants: ServiceOrderSuggestionVariant[];
  payloadVariants?: ServiceOrderAirPayloadVariant[];
}

@Injectable({ providedIn: 'root' })
export class ServiceOrdersService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<ServiceOrder[]> {
    return this.api.get<ServiceOrder[]>('/service-orders');
  }

  getOne(id: string): Observable<ServiceOrder> {
    return this.api.get<ServiceOrder>(`/service-orders/${id}`);
  }

  create(body: CreateServiceOrderRequest): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>('/service-orders', body);
  }

  update(id: string, body: Partial<CreateServiceOrderRequest>): Observable<ServiceOrder> {
    return this.api.patch<ServiceOrder>(`/service-orders/${id}`, body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/service-orders/${id}`);
  }

  getSuggestions(id: string): Observable<ServiceOrderSuggestion[]> {
    return this.api.post<ServiceOrderSuggestion[]>(`/service-orders/${id}/suggestions`, {});
  }

  selectPosition(
    id: string,
    body: {
      firePositionId: string;
      shellId: string;
      chargeId: string;
      zoneId: string | null;
    },
  ): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>(`/service-orders/${id}/select-position`, body);
  }

  sendToUnit(id: string, body: SendServiceOrderRequest = {}): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>(`/service-orders/${id}/send`, body);
  }

  accept(id: string): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>(`/service-orders/${id}/accept`, {});
  }

  reject(id: string, reason: string): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>(`/service-orders/${id}/reject`, {
      reason,
    });
  }

  reopen(id: string): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>(`/service-orders/${id}/reopen`, {});
  }

  start(id: string): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>(`/service-orders/${id}/start`, {});
  }

  complete(id: string, body: CompleteServiceOrderRequest): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>(`/service-orders/${id}/complete`, body);
  }

  cancel(id: string, reason?: string): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>(`/service-orders/${id}/cancel`, {
      reason,
    });
  }

  acceptPuarProposal(id: string): Observable<ServiceOrder> {
    return this.api.post<ServiceOrder>(`/service-orders/puar/${id}/accept`, {});
  }

  getMapResults(): Observable<ServiceOrderMapResult[]> {
    return this.api.get<ServiceOrderMapResult[]>('/service-orders/map-results');
  }



selectAirAsset(
  id: string,
  body: {
    airAssetPositionId: string;
    droneModelId: string;
    warheadTypeId: string;
  },
): Observable<ServiceOrder> {
  return this.api.post<ServiceOrder>(`/service-orders/${id}/select-air-asset`, body);
}

}
