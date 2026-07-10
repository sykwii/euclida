export interface ReconArea {
  id: string;
  name: string;
  status: string;
  description?: string | null;
  geometry?: { coordinates?: number[][][] };
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
}

export interface ReconObservation {
  id: string;
  source: string;
  inputProvider: string;
  targetType: string;
  observationDatetime: string;
  lat: number;
  lng: number;
  mgrs: string;
  status: string;
  targetId?: string | null;
  notes?: string | null;
  externalId?: string | null;
  platformId?: string | null;
  createdAt?: string;
}

export interface ReconImpact {
  id: string;
  source: string;
  inputProvider: string;
  targetType: string;
  impactDatetime: string;
  lat: number;
  lng: number;
  mgrs: string;
  status: string;
  notes?: string | null;
  externalId?: string | null;
  platformId?: string | null;
  createdAt?: string;
}

export interface ReconTarget {
  id: string;
  platformId?: string | null;
  targetType: string;
  status: string;
  lat: number;
  lng: number;
  mgrs: string;
  semiMajorM: number;
  semiMinorM: number;
  azimuthDeg: number;
  confidenceIndex: number;
  confidenceLabel: string;
  activityIndex: number;
  freshnessIndex: number;
  threatIndex: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReconEvent {
  id: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ReconAnalyticsSummary {
  observations: number;
  impacts: number;
  targets: number;
  confirmed?: number;
  processed?: number;
  mostActiveArea?: string | null;
}

export interface ReconAnalytics {
  summary?: ReconAnalyticsSummary;
  byType?: Array<{ targetType: string; count: number }>;
  bySource?: Array<{ source: string; count: number }>;
  byConfidence?: Array<{ confidenceLabel: string; count: number }>;
  daily?: Array<{ day: string; observations: number }>;
  from?: string;
  to?: string;
}

export interface ReconCorrelation {
  id: string;
  targetId: string;
  impactId: string;
  status: 'suggested' | 'accepted' | 'rejected' | string;
  score: number;
  distanceM: number;
  timeDeltaSec: number;
  reasonJson?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReconHeatmapPoint {
  lat: number;
  lng: number;
  count: number;
  intensity: number;
  confidence?: number;
  freshness?: number;
}

export interface ReconHeatmap {
  type: string;
  period: string;
  from?: string;
  to?: string;
  points: ReconHeatmapPoint[];
}

export interface ReconPuarProposal {
  id: string;
  targetId?: string | null;
  observationId?: string | null;
  sourceKind: string;
  status: string;
  payload: Record<string, unknown>;
  comments?: string | null;
  createdAt: string;
}

export interface ReconProcessedDecision {
  id: string;
  targetId: string;
  observationId: string;
  status: string;
  targetType: string;
  targetMgrs: string;
  observationMgrs: string;
}

export interface ReconImportPreviewRow {
  rowNumber: number;
  status: 'accepted' | 'duplicate' | 'warning' | 'error' | 'skipped' | string;
  message?: string;
  warnings?: string[];
  normalized?: Record<string, unknown>;
  raw: Record<string, string>;
}

export interface ReconImportPreview {
  filename?: string | null;
  delimiter?: string;
  columns: string[];
  mapping: Record<string, string>;
  totalRows: number;
  acceptedRows: number;
  duplicateRows: number;
  warningRows: number;
  errorRows: number;
  skippedRows: number;
  sampleRows: Array<Record<string, string>>;
  rows: ReconImportPreviewRow[];
  importedRows?: number;
  blockedByDuplicates?: boolean;
  message?: string;
  batchId?: string;
}

export interface ReconImportBatch {
  id: string;
  source: string;
  status: string;
  totalRows: number;
  acceptedRows: number;
  duplicateRows: number;
  errorRows: number;
  rawPayload?: Record<string, unknown>;
  createdAt: string;
  confirmedAt?: string | null;
}

export interface ReconImportError {
  id: string;
  batchId: string;
  rowNumber: number;
  errorCode: string;
  message: string;
  rawPayload?: Record<string, unknown>;
  createdAt: string;
}

export interface ReconAreaAnalyticsPeriod {
  observations: number;
  impacts: number;
  targets: number;
  newTargets: number;
  confirmed: number;
  processed: number;
  puar: number;
  mortar: number;
  tubeArtillery: number;
  mlrs: number;
  sourceCount: number;
  acceptedCorrelations: number;
  avgConfidence: number;
  activityIndex: number;
  freshnessIndex: number;
  threatIndex: number;
  newestActivityAt?: string | null;
}

export interface ReconAreaAnalyticsRow {
  areaId: string;
  name: string;
  color: string;
  primary: ReconAreaAnalyticsPeriod;
  comparison: ReconAreaAnalyticsPeriod;
  delta: Partial<ReconAreaAnalyticsPeriod>;
  change: {
    direction: 'up' | 'down' | 'stable' | string;
    percent: number;
    severity: 'normal' | 'attention' | 'critical' | string;
  };
  changes: {
    newTargetIds: string[];
    reactivatedTargetIds: string[];
    staleTargetIds: string[];
    newWeaponTypes: string[];
    newAcceptedCorrelationIds: string[];
  };
  recommendation: 'puar' | 'additional_recon' | 'observe' | 'archive' | 'none' | string;
  reasons: string[];
  dominantWeaponType?: string | null;
  sourceEffectiveness?: Array<{
    source: string;
    reportsCount: number;
    linkedToTargetPct: number;
    confirmedPct: number;
    puarPct: number;
  }>;
  decisionFunnel?: {
    observations: number;
    targets: number;
    puar: number;
    core: number;
  };
  conclusion?: string;
}
