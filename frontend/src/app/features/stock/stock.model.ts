export interface DepotSummary {
  id: string;
  name: string;
  depotType: string;
}

export interface StockResource {
  id: string;
  marking: string;
  quantity: number;
}

export interface StockByDepot {
  depot: DepotSummary;
  shells: StockResource[];
  charges: StockResource[];
  fuzes: StockResource[];
  primers: StockResource[];
}