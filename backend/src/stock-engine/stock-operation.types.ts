import type { StockResourceRef } from './stock-resource.types';

export type StockOperationType =
  | 'receipt'
  | 'transfer'
  | 'write_off'
  | 'return'
  | 'correction';

export interface StockOperationRequest {
  idempotencyKey: string;
  operationType: StockOperationType;

  /**
   * Optional legacy/audit label for StockMovement.
   * The canonical operation type remains operationType.
   */
  movementType?: string | null;

  fromDepotId?: string | null;
  toDepotId?: string | null;
  documentNumber?: string | null;
  comment?: string | null;
  reason?: string | null;
  unitId?: string | null;
  resources: StockResourceRef[];
}
