import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { StockMovement, StockMovementGroup } from './stock-movement.model';

export interface StockMovementBatchItemRequest {
  itemType: string;
  itemId: string;
  quantity: number;
}

export interface CreateStockMovementBatchRequest {
  fromDepotId?: string;
  toDepotId?: string;
  comment?: string;
  items: StockMovementBatchItemRequest[];
}

@Injectable({ providedIn: 'root' })
export class StockMovementsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<StockMovement[]> {
    return this.api.get<StockMovement[]>('/stock-movements');
  }

  getGrouped(): Observable<StockMovementGroup[]> {
    return this.api.get<StockMovementGroup[]>('/stock-movements/grouped');
  }

  createBatch(body: CreateStockMovementBatchRequest): Observable<StockMovement[]> {
    return this.api.post<StockMovement[]>('/stock-movements/batch', body);
  }
}