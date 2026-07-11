import type {
  StockOperationType,
  StockResourceRef,
  StockResourceType,
  StockTransactionRequest,
  StorageLocationRef,
  StorageLocationType,
} from './contracts';

export type DroneStockResourceType = Extract<
  StockResourceType,
  'drone' | 'warhead'
>;

export type DroneStorageType = Extract<
  StorageLocationType,
  'depot' | 'air_asset'
>;

export type DroneStockOperationType = Extract<
  StockOperationType,
  'receipt' | 'transfer' | 'issue' | 'return' | 'write_off' | 'correction'
>;

export interface DroneStorageRef extends StorageLocationRef {
  type: DroneStorageType;
}

export interface DroneStockResourceRef extends StockResourceRef {
  resourceType: DroneStockResourceType;
  accountingUnit?: 'piece';
}

export interface DroneStockOperationRequest
  extends Omit<
    StockTransactionRequest,
    'operationType' | 'source' | 'destination' | 'resources'
  > {
  operationType: DroneStockOperationType;
  source?: DroneStorageRef | null;
  destination?: DroneStorageRef | null;
  resources: DroneStockResourceRef[];
  movementType: string;
}
