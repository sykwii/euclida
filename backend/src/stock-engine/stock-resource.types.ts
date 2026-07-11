export type StockResourceType =
  | 'shell'
  | 'charge'
  | 'fuze'
  | 'primer'
  | 'drone'
  | 'warhead';

export type StockAccountingUnit = 'piece' | 'module';

export interface StockResourceRef {
  resourceType: StockResourceType;
  resourceId: string;
  quantity: number;
  accountingUnit?: StockAccountingUnit;
}
