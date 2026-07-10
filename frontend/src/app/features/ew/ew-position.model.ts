import { Unit } from '../units/unit.model';

export type EwEffectMode = 'radius' | 'sector';
export type EwReadinessStatus = 'ready' | 'not_ready';

export interface EwFrequencyRange {
  id?: string;
  label?: string | null;
  frequencyFromMhz: number;
  frequencyToMhz: number;
}

export interface EwPosition {
  id: string;
  name: string;
  unitId: string;
  unit?: Unit;
  callsign: string;
  stationName: string;
  lat: number;
  lng: number;
  mgrs?: string | null;
  effectMode: EwEffectMode;
  radiusM?: number | null;
  mainDirectionUnits?: number | null;
  mainDirectionDegrees?: number | null;
  traverseLeftUnits?: number | null;
  traverseLeftDegrees?: number | null;
  traverseRightUnits?: number | null;
  traverseRightDegrees?: number | null;
  sectorLeftDegrees?: number | null;
  sectorRightDegrees?: number | null;
  readinessStatus: EwReadinessStatus | string;
  notReadyReason?: string | null;
  personnelRotationDate?: string | null;
  note?: string | null;
  frequencyRanges?: EwFrequencyRange[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateEwPositionRequest {
  name: string;
  unitId: string;
  callsign: string;
  stationName: string;
  lat?: number;
  lng?: number;
  mgrs?: string;
  effectMode: EwEffectMode;
  radiusM?: number;
  mainDirectionUnits?: number;
  traverseLeftUnits?: number;
  traverseRightUnits?: number;
  readinessStatus?: EwReadinessStatus;
  notReadyReason?: string;
  personnelRotationDate?: string;
  note?: string;
  frequencyRanges: Array<{
    label?: string;
    frequencyFromMhz: number;
    frequencyToMhz: number;
  }>;
}
