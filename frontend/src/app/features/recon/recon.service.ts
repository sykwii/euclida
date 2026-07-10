import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from '../../core/api-config';
import { ApiService } from '../../core/api.service';
import {
  ReconAnalytics,
  ReconArea,
  ReconAreaAnalyticsRow,
  ReconCorrelation,
  ReconEvent,
  ReconHeatmap,
  ReconImpact,
  ReconImportBatch,
  ReconImportError,
  ReconImportPreview,
  ReconObservation,
  ReconProcessedDecision,
  ReconPuarProposal,
  ReconTarget,
} from './recon.model';

@Injectable({ providedIn: 'root' })
export class ReconService {
  constructor(private readonly api: ApiService) {}

  getSettings(): Observable<Record<string, unknown>> {
    return this.api.get<Record<string, unknown>>('/recon/settings');
  }

  getAreas(): Observable<ReconArea[]> {
    return this.api.get<ReconArea[]>('/recon/areas?limit=200');
  }

  createArea(body: { name: string; description?: string; coordinates: [number, number][] }): Observable<ReconArea> {
    return this.api.post<ReconArea>('/recon/areas', body);
  }

  getObservations(): Observable<ReconObservation[]> {
    return this.api.get<ReconObservation[]>('/recon/observations?limit=500');
  }

  createObservation(body: Record<string, unknown>): Observable<ReconObservation> {
    return this.api.post<ReconObservation>('/recon/observations', body);
  }

  hideObservation(id: string): Observable<void> {
    return this.api.patch<void>(`/recon/observations/${id}/hide`, {});
  }

  getImpacts(): Observable<ReconImpact[]> {
    return this.api.get<ReconImpact[]>('/recon/impacts?limit=500');
  }

  createImpact(body: Record<string, unknown>): Observable<ReconImpact> {
    return this.api.post<ReconImpact>('/recon/impacts', body);
  }

  previewImport(body: {
    csv: string;
    filename?: string;
    source?: string;
    duplicateStrategy?: string;
    mapping?: Record<string, string>;
    targetTypeOverride?: string;
  }): Observable<ReconImportPreview> {
    return this.api.post<ReconImportPreview>('/recon/import/preview', body);
  }

  confirmImport(body: {
    csv: string;
    filename?: string;
    source?: string;
    duplicateStrategy?: string;
    mapping?: Record<string, string>;
    targetTypeOverride?: string;
  }): Observable<ReconImportPreview> {
    return this.api.post<ReconImportPreview>('/recon/import/confirm', body);
  }

  getImportHistory(): Observable<ReconImportBatch[]> {
    return this.api.get<ReconImportBatch[]>('/recon/import/history?limit=50');
  }

  getImportErrors(batchId: string): Observable<ReconImportError[]> {
    return this.api.get<ReconImportError[]>(`/recon/import/history/${batchId}/errors?limit=200`);
  }

  async downloadImportErrorsCsv(batchId: string): Promise<void> {
    const token = localStorage.getItem('euclida_access_token');
    const response = await fetch(`${API_URL}/recon/import/history/${batchId}/errors.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recon-import-errors-${batchId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  getEvents(): Observable<ReconEvent[]> {
    return this.api.get<ReconEvent[]>('/recon/events');
  }

  getTargets(): Observable<ReconTarget[]> {
    return this.api.get<ReconTarget[]>('/recon/targets?limit=500');
  }

  createTarget(body: Record<string, unknown>): Observable<ReconTarget> {
    return this.api.post<ReconTarget>('/recon/targets', body);
  }

  recalculateTarget(id: string): Observable<void> {
    return this.api.post<void>(`/recon/targets/${id}/recalculate`, {});
  }

  mergeTarget(id: string, targetIds: string[]): Observable<void> {
    return this.api.post<void>(`/recon/targets/${id}/merge`, { targetIds });
  }

  excludeObservation(id: string, observationId: string): Observable<void> {
    return this.api.post<void>(`/recon/targets/${id}/exclude-observation`, { observationId });
  }

  updateTargetStatus(id: string, status: string): Observable<void> {
    return this.api.patch<void>(`/recon/targets/${id}/status`, { status });
  }

  createAssessment(body: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.api.post<Record<string, unknown>>('/recon/assessments', body);
  }

  getAnalytics(range: string, from?: string, to?: string): Observable<ReconAnalytics> {
    const params = new URLSearchParams({ range });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return this.api.get<ReconAnalytics>(`/recon/analytics/basic?${params.toString()}`);
  }

  getFullAnalytics(range: string, from?: string, to?: string): Observable<Record<string, unknown>> {
    const params = new URLSearchParams({ range });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return this.api.get<Record<string, unknown>>(`/recon/analytics?${params.toString()}`);
  }

  getAreaAnalytics(params: {
    primaryFrom: string;
    primaryTo: string;
    compareFrom: string;
    compareTo: string;
    includeHistorical?: boolean;
    targetType?: string;
    source?: string;
  }): Observable<ReconAreaAnalyticsRow[]> {
    const search = new URLSearchParams({
      primaryFrom: params.primaryFrom,
      primaryTo: params.primaryTo,
      compareFrom: params.compareFrom,
      compareTo: params.compareTo,
    });
    if (params.includeHistorical) search.set('includeHistorical', 'true');
    if (params.targetType) search.set('targetType', params.targetType);
    if (params.source) search.set('source', params.source);
    return this.api.get<ReconAreaAnalyticsRow[]>(`/recon/analytics/areas?${search.toString()}`);
  }

  getDailyReport(): Observable<Record<string, unknown>> {
    return this.api.get<Record<string, unknown>>('/recon/reports/daily');
  }

  getCorrelations(): Observable<ReconCorrelation[]> {
    return this.api.get<ReconCorrelation[]>('/recon/correlations?limit=500');
  }

  recalculateCorrelations(): Observable<Record<string, unknown>> {
    return this.api.post<Record<string, unknown>>('/recon/correlations/recalc', {});
  }

  acceptCorrelation(id: string): Observable<void> {
    return this.api.post<void>(`/recon/correlations/${id}/accept`, {});
  }

  rejectCorrelation(id: string): Observable<void> {
    return this.api.post<void>(`/recon/correlations/${id}/reject`, {});
  }

  getHeatmap(type: string, period: string, from?: string, to?: string): Observable<ReconHeatmap> {
    const params = new URLSearchParams({
      type,
      period,
    });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return this.api.get<ReconHeatmap>(`/recon/heatmap?${params.toString()}`);
  }

  getPuar(): Observable<ReconPuarProposal[]> {
    return this.api.get<ReconPuarProposal[]>('/recon/puar');
  }

  createPuar(body: { targetId?: string; observationId?: string; comments?: string }): Observable<ReconPuarProposal> {
    return this.api.post<ReconPuarProposal>('/recon/puar', body);
  }

  getProcessedDecisions(): Observable<ReconProcessedDecision[]> {
    return this.api.get<ReconProcessedDecision[]>('/recon/processed-target-decisions');
  }

  decideProcessedTarget(targetId: string, observationId: string, decision: string): Observable<void> {
    return this.api.post<void>(`/recon/targets/${targetId}/processed-decision`, { observationId, decision });
  }
}
