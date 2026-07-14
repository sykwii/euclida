import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import {
  ExecutionRecord,
  ExecutionRecordPurpose,
  ExecutionValidationResult,
} from './execution-record.model';

export interface CreateExecutionRecordRequest {
  idempotencyKey: string;
  executionType: 'artillery';
  purpose: ExecutionRecordPurpose;
  result: 'executed' | 'misfire' | 'aborted' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  quantity: number;
  comment?: string;
  artillery: {
    compositionSource: 'planned' | 'template' | 'manual';
    sourceShotConfigurationId?: string;
    weaponModelId: string;
    shellId: string;
    fuzeId: string;
    primerId: string;
    zoneId?: string | null;
    maxRangeM: number;
    compositionSnapshot: Record<string, unknown>;
    charges: Array<{
      chargeId: string;
      chargeName: string;
      quantityPerShot: number;
      accountingUnit: 'piece' | 'module';
      sortOrder: number;
    }>;
  };
}

@Injectable({ providedIn: 'root' })
export class ExecutionRecordsService {
  constructor(private readonly api: ApiService) {}

  list(serviceOrderId: string): Observable<ExecutionRecord[]> {
    return this.api.get<ExecutionRecord[]>(`/execution/service-orders/${serviceOrderId}`);
  }

  create(
    serviceOrderId: string,
    body: CreateExecutionRecordRequest,
  ): Observable<ExecutionRecord> {
    return this.api.post<ExecutionRecord>(`/execution/service-orders/${serviceOrderId}/records`, body);
  }

  post(id: string): Observable<ExecutionRecord> {
    return this.api.post<ExecutionRecord>(`/execution/records/${id}/post`, {});
  }

  cancel(id: string): Observable<ExecutionRecord> {
    return this.api.post<ExecutionRecord>(`/execution/records/${id}/cancel`, {});
  }

  validate(id: string): Observable<ExecutionValidationResult> {
    return this.api.get<ExecutionValidationResult>(`/execution/records/${id}/validate`);
  }
}
