export type LogisticsMode = 'ammunition' | 'drone' | 'warhead' | 'all';

export type InventoryResourceType =
  | 'shell'
  | 'charge'
  | 'fuze'
  | 'primer'
  | 'drone'
  | 'warhead';

export type InventoryAccountingUnit = 'piece' | 'module';

export interface InventoryItem {
  resourceType: InventoryResourceType;
  resourceId: string;
  name: string;
  category: 'ammunition' | 'drone' | 'warhead';

  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  accountingUnit: InventoryAccountingUnit;

  updatedAt: string | null;
  lastMovementAt: string | null;
  lastMovementType: string | null;
  capabilities: Record<string, unknown>;
}

export interface DepotInventoryView {
  depot: {
    id: string;
    name: string;
    depotType: string;
    unitId: string | null;
  };

  totals: {
    positions: number;
    nonZeroPositions: number;
    totalQuantity: number;
  };

  resources: InventoryItem[];
}

export interface InventoryHistoryItem {
  id: string;
  movementType: string;
  movementDatetime?: string;
  createdAt?: string;
  quantity: number;
  fromDepotId?: string | null;
  toDepotId?: string | null;
  depotFromId?: string | null;
  depotToId?: string | null;
  comment?: string | null;
  documentNumber?: string | null;
}

export interface DepotTreeRow<TDepot> {
  depot: TDepot;
  level: number;
  hasChildren: boolean;
}
