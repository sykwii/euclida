export interface Unit {
  id: string;
  name: string;
  type: string;
}

export interface Depot {
  id: string;
  name: string;
  depotType: string;
}

export type FirePositionOperationalReasonCode =
  | 'fp_threat'
  | 'fp_damaged'
  | 'fp_prohibited'
  | 'fp_other'
  | 'weapon_missing'
  | 'weapon_not_ready'
  | null;

export interface FirePosition {
  id: string;
  name: string;
  positionType?:
    | 'fire_position'
    | 'aerial_recon'
    | 'ew_post'
    | 'ew_station'
    | 'air_asset_crew'
    | string;

  unitId: string | null;
  unit?: Unit | null;

  ammoDepotId: string | null;
  ammoDepot?: Depot | null;
  personnelRotationDate: string | null;
  lat: number;
  lng: number;
  mgrs: string | null;
  canEdit?: boolean;
  isOwnScope?: boolean;
  publicViewOnly?: boolean;
  hasSg: boolean;
  readinessStatus: string;
  notReadyReason: string | null;
  operationalState: {
    ready: boolean;
    displayState: 'ready' | 'danger' | 'warning' | 'unknown';
    reasonCode: FirePositionOperationalReasonCode;
    reasonLabel: string | null;
    assignedWeapon: FirePosition['assignedWeapon'];
  };

  completedVgzCount: number;
  personnelRotationStatus: string | null;
  airSituationStatus: string | null;

  mainDirectionUnits: number | null;
  traverseLeftUnits: number | null;
  traverseRightUnits: number | null;

  mainDirectionDegrees: number | null;
  traverseLeftDegrees: number | null;
  traverseRightDegrees: number | null;

  sectorLeftDegrees: number | null;
  sectorRightDegrees: number | null;
  maxSectorDistanceM?: number;
  aggregateReady?: boolean;
  aggregateReadinessReasons?: Array<
    | 'fp_damaged'
    | 'fp_prohibited'
    | 'fp_other'
    | 'fp_threat'
    | 'weapon_missing'
    | 'weapon_not_ready'
  >;

  assignedWeapon?: {
    id: string;
    readinessStatus: string;
    notReadyReason: string | null;
    deploymentStatus?: string;
    currentFirePositionId?: string | null;
    maintenanceStatus?: string | null;
    maintenanceRequestedStartAt?: string | null;
    maintenancePlannedEndAt?: string | null;
    maintenanceActualEndAt?: string | null;
    maintenanceNote?: string | null;
    callsign: string | null;
    serialNumber: string | null;
    weaponModel?: {
      id: string;
      name: string;
      systemType: string;
    } | null;
    unit?: {
      id: string;
      name: string;
      type: string;
    } | null;
  } | null;
  incomingWeapon?: {
    id: string;
    readinessStatus: string;
    notReadyReason: string | null;
    deploymentStatus?: string;
    currentFirePositionId?: string | null;
    callsign: string | null;
    serialNumber: string | null;
    weaponModel?: {
      id: string;
      name: string;
      systemType: string;
    } | null;
    unit?: {
      id: string;
      name: string;
      type: string;
    } | null;
  } | null;
  incomingDeployment?: {
    id: string;
    status: string;
    fromLocationType: string | null;
    fromLocationId: string | null;
    toLocationType: string | null;
    toLocationId: string | null;
    orderedAt: string;
    departedAt: string | null;
    arrivedAt: string | null;
    note: string | null;
  } | null;
}
