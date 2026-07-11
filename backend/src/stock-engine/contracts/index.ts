export type StockAccountingUnit = 'piece' | 'module';

export type StockResourceType =
  | 'shell'
  | 'charge'
  | 'fuze'
  | 'primer'
  | 'drone'
  | 'warhead';

export type StockOperationType =
  | 'receipt'
  | 'transfer'
  | 'issue'
  | 'return'
  | 'write_off'
  | 'correction';

export type StorageLocationType =
  | 'depot'
  | 'air_asset'
  | 'fire_position';

export interface StorageLocationRef {
  type: StorageLocationType;
  id: string;
}

export interface StockResourceRef {
  resourceType: StockResourceType;
  resourceId: string;
  quantity: number;
  accountingUnit?: StockAccountingUnit;
}

export interface StockTransactionRequest {
  idempotencyKey: string;
  operationType: StockOperationType;
  source?: StorageLocationRef | null;
  destination?: StorageLocationRef | null;
  resources: StockResourceRef[];
  documentNumber?: string | null;
  comment?: string | null;
  reason?: string | null;
  unitId?: string | null;
}
