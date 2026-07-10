export type ServiceOrderStatus =
  | 'draft'
  | 'proposed'
  | 'sent'
  | 'sent_to_division'
  | 'sent_to_battery'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type ServiceOrderAssignedScope = 'division' | 'battery';

export interface ServiceOrderUnitRef {
  id: string;
  name: string;
  type?: string | null;
  parentId?: string | null;
}

export interface ServiceOrder {
  id: string;
  orderNumber: string;
  status: ServiceOrderStatus | string;

  createdByUserId: string | null;
  assignedUnitId: string | null;
  assignedScope: ServiceOrderAssignedScope | null;
  sentByUserId: string | null;
  acceptedByUserId: string | null;
  completedByUserId: string | null;
  reconSnapshot?: Record<string, unknown> | null;
  sourceReconTargetId?: string | null;
  sourceReconObservationId?: string | null;
  sourcePuarProposalId?: string | null;
  reconSnapshotUpdatedAt?: string | null;
  reconLinkCheckedAt?: string | null;

  actualQuantity: number | null;
  actualChargeQuantity: number | null;
  actualChargeModulesPerShot: number | null;

  targetLat: number;
  targetLng: number;
  targetMgrs: string | null;
  targetSettlement: string | null;

  taskType: string;

  plannedResourceAId: string | null;
  plannedResourceBId: string | null;
  plannedQuantity: number;

  selectedFirePositionId: string | null;
  executorType?: 'fire_position' | 'air_asset_position' | null;

selectedAirAssetPositionId?: string | null;
selectedDroneModelId?: string | null;
selectedWarheadTypeId?: string | null;
linkedAirTaskId?: string | null;
  selectedShellId?: string | null;
  selectedChargeId?: string | null;
  selectedZoneId?: string | null;
  selectedShotConfigurationId?: string | null;

  rejectionReason: string | null;
  rejectedByUnitName: string | null;
  rejectedAt: string | null;

  startedAt: string | null;
  completedAt: string | null;

  resultType: string | null;
  resultComment: string | null;

  createdAt: string;
  updatedAt: string;

  selectedFirePosition: {
    id: string;
    name: string;
    unitId?: string | null;
    unit?: ServiceOrderUnitRef | null;
  } | null;

  selectedShell: {
    id: string;
    marking: string;
  } | null;

  selectedCharge: {
    id: string;
    marking: string;
    chargeKind?: 'unit' | 'modular';
    modulesPerCharge?: number | null;
    maxUsableModules?: number | null;
  } | null;

  selectedZone: {
    id: string;
    zoneNumber: number;
    distanceFromM: number;
    distanceToM: number;
  } | null;

  selectedShotConfiguration?: {
    id: string;
    name: string;
    maxRangeM: number;
    fuzeId?: string | null;
    primerId?: string | null;
    shell?: {
      id: string;
      marking: string;
    } | null;
    fuze?: {
      id: string;
      marking: string;
    } | null;
    primer?: {
      id: string;
      marking: string;
    } | null;
    zone?: {
      id: string;
      zoneNumber: number;
      distanceFromM: number;
      distanceToM: number;
    } | null;
    charges: Array<{
      chargeId: string;
      quantityPerShot: number;
      sortOrder: number;
      charge: {
        id: string;
        marking: string;
        chargeKind?: 'unit' | 'modular';
      };
    }>;
  } | null;

  selectedAirAssetPosition?: {
    id: string;
    name: string;
    callsign?: string | null;
    unitId?: string | null;
    unit?: ServiceOrderUnitRef | null;
  } | null;

  selectedDroneModel?: {
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
  } | null;

  selectedWarheadType?: {
    id: string;
    name: string;
    weightKg?: number | null;
    measureUnit?: 'unit' | 'kg';
    note?: string | null;
  } | null;
}
