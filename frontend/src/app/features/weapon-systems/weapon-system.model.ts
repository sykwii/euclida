export interface WeaponModel {
  id: string;
  name: string;
  systemType: string;
  zonesCount: number;
}

export interface Unit {
  id: string;
  name: string;
  type: string;
}

export interface WeaponSystem {
  id: string;
  weaponModelId: string;
  weaponModel?: WeaponModel;
  serialNumber: string | null;
  callsign: string | null;
  unitId: string | null;
  unit?: Unit | null;
  readinessStatus: string;
  notReadyReason: string | null;
  maintenanceStatus?: string | null;
  maintenanceRequestedStartAt?: string | null;
  maintenancePlannedEndAt?: string | null;
  maintenanceActualEndAt?: string | null;
  maintenanceNote?: string | null;
  maintenanceRequestedByUserId?: string | null;
  maintenanceApprovedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  locationType: string;
firePositionId: string | null;
firePosition?: {
  id: string;
  name: string;
} | null;
}
