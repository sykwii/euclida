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

  assignedWeapon?: {
    id: string;
    readinessStatus: string;
    notReadyReason: string | null;
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
}
