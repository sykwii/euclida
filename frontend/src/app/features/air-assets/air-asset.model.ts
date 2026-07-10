import { Unit } from '../units/unit.model';

export type AirAssetGroup = 'recon' | 'combat';
export type AirReconType = 'copter' | 'fixed_wing';
export type AirCombatType = 'fpv_radio' | 'fpv_fiber' | 'kamikaze' | 'heavy_bomber';
export type AirReadinessStatus = 'ready' | 'not_ready';
export type AirReconAreaStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type DroneCameraType = 'none' | 'day' | 'night' | 'thermal' | 'day_night';

export interface AirReconAreaPoint {
  id?: string;
  pointOrder?: number;
  lat: number;
  lng: number;
}

export interface AirReconArea {
  id?: string;
  airAssetPositionId?: string;
  airAssetPosition?: AirAssetPosition;
  name?: string | null;
  activeDate: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  status?: AirReconAreaStatus;
  note?: string | null;
  points: AirReconAreaPoint[];
}

export type AirAssetTaskType = 'recon' | 'combat';
export type AirAssetTaskStatus = 'planned' | 'sent' | 'in_progress' | 'completed' | 'cancelled';

export interface AirAssetTaskPoint {
  id?: string;
  pointOrder?: number;
  lat: number;
  lng: number;
}

export interface AirAssetTask {
  id: string;
  taskType: AirAssetTaskType;
  name: string;
  unitId: string;
  unit?: Unit;
  airAssetPositionId: string;
  airAssetPosition?: AirAssetPosition;
  droneModelId?: string | null;
  droneModel?: DroneModel | null;
  warheadTypeId?: string | null;
  warheadType?: DroneWarheadType | null;
  areaName: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  status: AirAssetTaskStatus;
  note?: string | null;
  points: AirAssetTaskPoint[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UpsertAirAssetTaskRequest {
  taskType: AirAssetTaskType;
  name: string;
  airAssetPositionId: string;
  droneModelId?: string;
  warheadTypeId?: string;
  areaName: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  status?: AirAssetTaskStatus;
  note?: string;
  points: Array<{ lat: number; lng: number }>;
}

export interface DroneModel {
  id: string;
  name: string;
  droneGroup: string;
  droneType: string;
  cameraType?: DroneCameraType;
  note?: string | null;
  maxRangeM?: number | null;
cruiseSpeedKmh?: number | null;
enduranceMinutes?: number | null;
payloadCapacityKg?: number | null;
maxAltitudeM?: number | null;
maxWindMs?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DroneWarheadType {
  id: string;
  name: string;
  weightKg?: number | null;
  measureUnit?: 'unit' | 'kg';
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AirAssetDroneStock {
  id: string;
  airAssetPositionId: string;
  droneModelId: string;
  droneModel?: DroneModel;
  quantity: number;
  updatedAt?: string;
}

export interface AirAssetWarheadStock {
  id: string;
  airAssetPositionId: string;
  warheadTypeId: string;
  warheadType?: DroneWarheadType;
  quantity: number;
  updatedAt?: string;
}

export interface AirAssetPosition {
  id: string;
  name: string;
  unitId: string;
  unit?: Unit;
  callsign: string;
  assetGroup: AirAssetGroup;
  reconType?: AirReconType | null;
  combatType?: AirCombatType | null;
  lat: number;
  lng: number;
  mgrs?: string | null;
  readinessStatus: AirReadinessStatus | string;
  notReadyReason?: string | null;
  personnelRotationDate?: string | null;
  assetName?: string | null;
  droneModel?: string | null;
  assetQuantity?: number;
  mainDirectionUnits?: number | null;
  mainDirectionDegrees?: number | null;
  traverseLeftUnits?: number | null;
  traverseLeftDegrees?: number | null;
  traverseRightUnits?: number | null;
  traverseRightDegrees?: number | null;
  sectorLeftDegrees?: number | null;
  sectorRightDegrees?: number | null;
  maxSectorDistanceM?: number | null;
  note?: string | null;
  reconAreas?: AirReconArea[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAirAssetPositionRequest {
  name: string;
  unitId: string;
  callsign: string;
  assetGroup: AirAssetGroup;
  reconType?: AirReconType;
  combatType?: AirCombatType;
  lat?: number;
  lng?: number;
  mgrs?: string;
  readinessStatus?: AirReadinessStatus;
  notReadyReason?: string;
  personnelRotationDate?: string;
  assetName?: string;
  droneModel?: string;
  assetQuantity?: number;
  mainDirectionUnits?: number;
  traverseLeftUnits?: number;
  traverseRightUnits?: number;
  maxSectorDistanceM?: number;
  note?: string;
  reconAreas?: AirReconArea[];
}
