import { Depot } from '../depots/depot.model';

export interface StockMovement {
  id: string;
  movementGroupId: string | null;
  documentNumber: string | null;

  fromDepotId: string | null;
  toDepotId: string | null;
  fromDepot?: Depot | null;
  toDepot?: Depot | null;

  itemType: string;
  itemId: string;
  quantity: number;

  movementType: string;
  movementDatetime: string;
  comment: string | null;
}

export interface StockMovementGroup {
  groupId: string;
  documentNumber: string;
  movementDatetime: string;
  movementType: string;
  fromDepot?: Depot | null;
  toDepot?: Depot | null;
  comment: string | null;
  items: StockMovement[];
}