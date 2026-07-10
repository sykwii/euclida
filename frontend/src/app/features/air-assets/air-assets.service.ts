import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import {
  AirAssetDroneStock,
  AirAssetPosition,
  AirAssetTask,
  AirAssetWarheadStock,
  AirReconArea,
  CreateAirAssetPositionRequest,
  DroneModel,
  DroneWarheadType,
  UpsertAirAssetTaskRequest,
} from './air-asset.model';

@Injectable({ providedIn: 'root' })
export class AirAssetsService {
  constructor(private readonly api: ApiService) {}

  getAll() {
    return this.api.get<AirAssetPosition[]>('/air-assets');
  }

  getOne(id: string) {
    return this.api.get<AirAssetPosition>(`/air-assets/${id}`);
  }

  create(body: CreateAirAssetPositionRequest) {
    return this.api.post<AirAssetPosition>('/air-assets', body);
  }

  update(id: string, body: Partial<CreateAirAssetPositionRequest>) {
    return this.api.patch<AirAssetPosition>(`/air-assets/${id}`, body);
  }

  delete(id: string) {
    return this.api.delete<void>(`/air-assets/${id}`);
  }

  getDroneModels() {
    return this.api.get<DroneModel[]>('/drone-logistics/models');
  }

  getWarheadTypes() {
    return this.api.get<DroneWarheadType[]>('/drone-logistics/warhead-types');
  }

  getDroneStock(airAssetId: string) {
    return this.api.get<AirAssetDroneStock[]>(`/drone-logistics/air-assets/${airAssetId}/drone-stock`);
  }

  getWarheadStock(airAssetId: string) {
    return this.api.get<AirAssetWarheadStock[]>(`/drone-logistics/air-assets/${airAssetId}/warhead-stock`);
  }

  correctDroneStock(airAssetId: string, body: { droneModelId: string; quantity: number; comment?: string }) {
    return this.api.post<AirAssetDroneStock>(`/drone-logistics/air-assets/${airAssetId}/drone-stock/correction`, body);
  }

  correctWarheadStock(airAssetId: string, body: { warheadTypeId: string; quantity: number; comment?: string }) {
    return this.api.post<AirAssetWarheadStock>(`/drone-logistics/air-assets/${airAssetId}/warhead-stock/correction`, body);
  }

  getReconAreas(airAssetId: string) {
    return this.api.get<AirReconArea[]>(`/air-assets/${airAssetId}/recon-areas`);
  }

  createReconArea(airAssetId: string, body: AirReconArea) {
    return this.api.post<AirReconArea>(`/air-assets/${airAssetId}/recon-areas`, body);
  }

  updateReconArea(id: string, body: AirReconArea) {
    return this.api.patch<AirReconArea>(`/air-recon-areas/${id}`, body);
  }

  deleteReconArea(id: string) {
    return this.api.delete<void>(`/air-recon-areas/${id}`);
  }

  getTasks() {
    return this.api.get<AirAssetTask[]>('/air-asset-tasks');
  }

  createTask(body: UpsertAirAssetTaskRequest) {
    return this.api.post<AirAssetTask>('/air-asset-tasks', body);
  }

  updateTask(id: string, body: UpsertAirAssetTaskRequest) {
    return this.api.patch<AirAssetTask>(`/air-asset-tasks/${id}`, body);
  }

  deleteTask(id: string) {
    return this.api.delete<void>(`/air-asset-tasks/${id}`);
  }
}
