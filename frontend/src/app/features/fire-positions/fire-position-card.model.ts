import { FirePosition } from './fire-position.model';

export interface StockItem {
  id: string;
  quantity: number;
  shell?: { marking: string };
  charge?: { marking: string };
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