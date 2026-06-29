import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { StockByDepot } from './stock.model';

@Injectable({ providedIn: 'root' })
export class StockService {
  constructor(private readonly api: ApiService) {}

  getByDepots(): Observable<StockByDepot[]> {
    return this.api.get<StockByDepot[]>('/stock/by-depots');
  }
}