import type {
  StockTransactionRequest,
} from './contracts';

export {
  type StockOperationType,
  type StockTransactionRequest,
} from './contracts';

export interface StockOperationRequest
  extends StockTransactionRequest {
  /**
   * Optional legacy/audit label for StockMovement.
   * The canonical operation type remains operationType.
   */
  movementType?: string | null;

  fromDepotId?: string | null;
  toDepotId?: string | null;
}
