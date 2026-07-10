import { FirePosition } from './fire-position.model';

export interface StockItem {
  id: string;
  shellId?: string;
  chargeId?: string;
  quantity: number;
  shell?: { marking: string };
  charge?: {
    marking: string;
    chargeKind?: 'unit' | 'modular';
    modulesPerCharge?: number | null;
    maxUsableModules?: number | null;
  };
  fuze?: { marking: string };
  primer?: { marking: string };
}

export interface FirePositionCard {
  firePosition: FirePosition;
  assignedWeapon: {
    id: string;
    callsign: string | null;
    serialNumber: string | null;
    readinessStatus: string;
    notReadyReason: string | null;
    maintenanceStatus?: string | null;
    maintenanceRequestedStartAt?: string | null;
    maintenancePlannedEndAt?: string | null;
    maintenanceActualEndAt?: string | null;
    maintenanceNote?: string | null;
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
  localStock: {
    shells: StockItem[];
    charges: StockItem[];
    fuzes: StockItem[];
    primers: StockItem[];
  };
  lastSupplyAt: string | null;
  completedRequestsCount: number;
  maxSectorDistanceM: number;
}
