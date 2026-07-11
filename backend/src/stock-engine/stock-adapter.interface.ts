import type { EntityManager } from 'typeorm';
import type { StockAccountingUnit, StockResourceType } from './stock-resource.types';

export interface LockedStockBalance {
  depotId: string;
  resourceType: StockResourceType;
  resourceId: string;
  quantity: number;
  accountingUnit: StockAccountingUnit;
}

export interface StockAdapter {
  supports(resourceType: StockResourceType): boolean;
  defaultAccountingUnit(resourceType: StockResourceType, resourceId: string, manager: EntityManager): Promise<StockAccountingUnit>;
  lockBalance(manager: EntityManager, depotId: string, resourceType: StockResourceType, resourceId: string): Promise<LockedStockBalance | null>;
  increase(manager: EntityManager, depotId: string, resourceType: StockResourceType, resourceId: string, quantity: number): Promise<LockedStockBalance>;
  decrease(manager: EntityManager, depotId: string, resourceType: StockResourceType, resourceId: string, quantity: number): Promise<LockedStockBalance>;
  listByDepot(manager: EntityManager, depotId: string): Promise<LockedStockBalance[]>;
}
