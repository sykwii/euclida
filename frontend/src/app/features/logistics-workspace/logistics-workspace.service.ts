import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import {
  DepotInventoryView,
  InventoryHistoryItem,
  InventoryResourceType,
} from './logistics-workspace.model';

@Injectable({ providedIn: 'root' })
export class LogisticsWorkspaceService {
  constructor(private readonly api: ApiService) {}

  getDepotInventory(
    depotId: string,
    includeZero: boolean,
  ): Observable<DepotInventoryView> {
    return this.api.get<DepotInventoryView>(
      `/stock-engine/inventory/depots/${depotId}?includeZero=${includeZero}`,
    );
  }

  getHistory(
    depotId: string,
    resourceType: InventoryResourceType,
    resourceId: string,
  ): Observable<InventoryHistoryItem[]> {
    const query = new URLSearchParams({
      resourceType,
      resourceId,
    });

    return this.api.get<InventoryHistoryItem[]>(
      `/stock-engine/depots/${depotId}/history?${query.toString()}`,
    );
  }
}
