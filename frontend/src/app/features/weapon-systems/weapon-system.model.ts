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
  deploymentStatus: string;
  currentFirePositionId: string | null;
  currentFirePosition?: {
    id: string;
    name: string;
  } | null;
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
  maintenances?: Array<{
    id: string;
    reason: string;
    status: string;
    startedAt: string;
    expectedCompletedAt: string | null;
    completedAt: string | null;
    description: string | null;
    result: string | null;
  }>;
  deployments?: Array<{
    id: string;
    fromLocationType: string;
    fromLocationId: string | null;
    toLocationType: string;
    toLocationId: string | null;
    status: string;
    orderedAt: string;
    departedAt: string | null;
    arrivedAt: string | null;
    note: string | null;
  }>;
}
