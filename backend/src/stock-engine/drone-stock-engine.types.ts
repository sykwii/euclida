export type DroneStockResourceType = 'drone' | 'warhead';
export type DroneStorageType = 'depot' | 'air_asset';
export type DroneStockOperationType =
  | 'receipt'
  | 'issue'
  | 'return'
  | 'correction'
  | 'write_off';

export interface DroneStorageRef {
  storageType: DroneStorageType;
  storageId: string;
}

export interface DroneStockOperationRequest {
  idempotencyKey: string;
  operationType: DroneStockOperationType;
  resourceType: DroneStockResourceType;
  resourceId: string;
  quantity: number;
  source?: DroneStorageRef | null;
  destination?: DroneStorageRef | null;
  movementType: string;
  comment?: string | null;
  unitId?: string | null;
}
