import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AirAssetDroneStock, AirAssetPosition, AirAssetWarheadStock, DroneModel, DroneWarheadType } from '../air-assets/air-asset.model';
import { Depot } from '../depots/depot.model';

export interface DroneDepotStock {
  id: string;
  depotId: string;
  droneModelId: string;
  depot?: Depot;
  droneModel?: DroneModel;
  quantity: number;
  updatedAt?: string;
}

export interface WarheadDepotStock {
  id: string;
  depotId: string;
  warheadTypeId: string;
  warheadType?: DroneWarheadType;
  quantity: number;
  updatedAt?: string;
}

export interface DroneStockMovement {
  id: string;
  movementType: string;
  itemType: 'drone' | 'warhead';
  quantity: number;
  comment?: string | null;
  createdAt?: string;
  droneModel?: DroneModel | null;
  warheadType?: DroneWarheadType | null;
  depotFromId?: string | null;
  depotToId?: string | null;
  airAssetToId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DroneLogisticsService {
  constructor(private readonly api: ApiService) {}

  getModels(): Observable<DroneModel[]> {
    return this.api.get<DroneModel[]>('/drone-logistics/models');
  }

  createModel(body: Partial<DroneModel>): Observable<DroneModel> {
    return this.api.post<DroneModel>('/drone-logistics/models', body);
  }

  getWarheadTypes(): Observable<DroneWarheadType[]> {
    return this.api.get<DroneWarheadType[]>('/drone-logistics/warhead-types');
  }

  createWarheadType(body: Partial<DroneWarheadType>): Observable<DroneWarheadType> {
    return this.api.post<DroneWarheadType>('/drone-logistics/warhead-types', body);
  }

  getDepotDroneStock(depotId?: string): Observable<DroneDepotStock[]> {
    return this.api.get<DroneDepotStock[]>(this.withQuery('/drone-logistics/depot-drone-stock', { depotId }));
  }

  getDepotWarheadStock(depotId?: string): Observable<WarheadDepotStock[]> {
    return this.api.get<WarheadDepotStock[]>(this.withQuery('/drone-logistics/depot-warhead-stock', { depotId }));
  }

  addDroneToDepot(body: { depotId: string; droneModelId: string; quantity: number; comment?: string }): Observable<DroneDepotStock> {
    return this.api.post<DroneDepotStock>('/drone-logistics/depot-drone-stock/add', body);
  }

  addWarheadToDepot(body: { depotId: string; warheadTypeId: string; quantity: number; comment?: string }): Observable<WarheadDepotStock> {
    return this.api.post<WarheadDepotStock>('/drone-logistics/depot-warhead-stock/add', body);
  }

  transferDroneToAirAsset(body: { depotId: string; airAssetPositionId: string; droneModelId: string; quantity: number; comment?: string }): Observable<AirAssetDroneStock> {
    return this.api.post<AirAssetDroneStock>('/drone-logistics/transfer-drone-to-air-asset', body);
  }

  transferWarheadToAirAsset(body: { depotId: string; airAssetPositionId: string; warheadTypeId: string; quantity: number; comment?: string }): Observable<AirAssetWarheadStock> {
    return this.api.post<AirAssetWarheadStock>('/drone-logistics/transfer-warhead-to-air-asset', body);
  }

  getAirAssetDroneStock(airAssetPositionId?: string): Observable<AirAssetDroneStock[]> {
    return this.api.get<AirAssetDroneStock[]>(this.withQuery('/drone-logistics/air-asset-drone-stock', { airAssetPositionId }));
  }

  getAirAssetWarheadStock(airAssetPositionId?: string): Observable<AirAssetWarheadStock[]> {
    return this.api.get<AirAssetWarheadStock[]>(this.withQuery('/drone-logistics/air-asset-warhead-stock', { airAssetPositionId }));
  }

  getMovements(): Observable<DroneStockMovement[]> {
    return this.api.get<DroneStockMovement[]>('/drone-logistics/movements');
  }

  private withQuery(path: string, query: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const value = params.toString();
    return value ? `${path}?${value}` : path;
  }
}
