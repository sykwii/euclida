import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  HostListener,
  Inject,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, catchError, forkJoin, of } from 'rxjs';
import ms from 'milsymbol';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import {
  ReconAnalytics,
  ReconArea,
  ReconAreaAnalyticsRow,
  ReconCorrelation,
  ReconEvent,
  ReconHeatmap,
  ReconImpact,
  ReconImportBatch,
  ReconImportPreview,
  ReconObservation,
  ReconProcessedDecision,
  ReconPuarProposal,
  ReconTarget,
} from '../recon.model';
import { ReconService } from '../recon.service';

type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;
type LeafletLayerGroup = import('leaflet').LayerGroup;
type LeafletLatLngExpression = import('leaflet').LatLngExpression;
type LeafletMouseEvent = import('leaflet').LeafletMouseEvent;
type LeafletTileLayer = import('leaflet').TileLayer;

type ReconTab = 'areas' | 'observations' | 'impacts' | 'targets' | 'analytics' | 'puar' | 'journal';
type PeriodPreset = 'today' | '24h' | '7d' | '30d' | 'custom';
type ClickMode = 'observation' | 'impact' | 'area';
type SelectableKind = 'area' | 'observation' | 'impact' | 'target' | 'puar';

interface ReconPeriod {
  range: PeriodPreset;
  from: string;
  to: string;
}

interface DraftPointPreview {
  kind: 'observation' | 'impact';
  lat: number;
  lng: number;
  mgrs: string;
  targetType: string;
  source: string;
}

interface UiSelection {
  kind: SelectableKind;
  id: string;
}

interface ImportMappingField {
  key: string;
  label: string;
}

@Component({
  selector: 'app-recon-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recon-page.html',
  styleUrl: './recon-page.css',
})
export class ReconPage implements AfterViewInit, OnDestroy {
  private readonly subscription = new Subscription();
  private L?: LeafletModule;
  private map?: LeafletMap;
  private baseTile?: LeafletTileLayer;
  private areasLayer?: LeafletLayerGroup;
  private observationsLayer?: LeafletLayerGroup;
  private impactsLayer?: LeafletLayerGroup;
  private targetsLayer?: LeafletLayerGroup;
  private ellipsesLayer?: LeafletLayerGroup;
  private correlationsLayer?: LeafletLayerGroup;
  private heatmapLayer?: LeafletLayerGroup;
  private puarLayer?: LeafletLayerGroup;
  private previewLayer?: LeafletLayerGroup;
  private highlightLayer?: LeafletLayerGroup;

  activeTab: ReconTab = 'observations';
  loading = true;
  errorMessage = '';
  lastSyncLabel = '—';
  baseLayer = 'OSM';
  clickMode: ClickMode = 'observation';
  rightPanelOpen = false;
  layersOpen = false;
  selected: UiSelection | null = null;
  draftArea: [number, number][] = [];
  draftPoint: DraftPointPreview | null = null;
  highlightedId = '';

  areas: ReconArea[] = [];
  observations: ReconObservation[] = [];
  impacts: ReconImpact[] = [];
  targets: ReconTarget[] = [];
  events: ReconEvent[] = [];
  correlations: ReconCorrelation[] = [];
  heatmap: ReconHeatmap | null = null;
  puarProposals: ReconPuarProposal[] = [];
  processedDecisions: ReconProcessedDecision[] = [];
  primaryAnalytics: Record<string, unknown> = {};
  comparisonAnalytics: Record<string, unknown> = {};
  primaryBasic: ReconAnalytics = {};
  comparisonBasic: ReconAnalytics = {};
  dailyReport: Record<string, unknown> = {};
  areaAnalytics: ReconAreaAnalyticsRow[] = [];
  importCsv = '';
  importFilename = '';
  importSource = 'light_recon';
  importTargetTypeOverride = '';
  importDuplicateStrategy = 'skip';
  importMapping: Record<string, string> = {};
  importPreview: ReconImportPreview | null = null;
  importHistory: ReconImportBatch[] = [];
  importBusy = false;

  readonly importMappingFields: ImportMappingField[] = [
    { key: 'externalId', label: 'Зовнішній ID' },
    { key: 'observationDatetime', label: 'Час спостереження' },
    { key: 'coordinates', label: 'Координати' },
    { key: 'lat', label: 'Широта' },
    { key: 'lng', label: 'Довгота' },
    { key: 'mgrs', label: 'MGRS' },
    { key: 'sidc', label: 'SIDC' },
    { key: 'name', label: 'Назва' },
    { key: 'platformType', label: 'Платформа' },
    { key: 'staffComments', label: 'Коментар штабу' },
    { key: 'reliabilityCredibility', label: 'Надійність/достовірність' },
    { key: 'source', label: 'Джерело з CSV' },
  ];

  layerState = {
    areas: true,
    observations: true,
    impacts: true,
    targets: true,
    ellipses: true,
    correlations: true,
    heatmap: false,
    puar: false,
    historical: false,
    analyticalColoring: true,
  };

  areaForm = {
    name: 'Новий район',
    description: '',
  };

  pointForm = {
    source: 'light_recon',
    targetType: 'mortar',
    lat: '',
    lng: '',
    mgrs: '',
    datetime: this.toInputDateTime(new Date()),
    notes: '',
  };

  primaryPeriod: ReconPeriod = this.makePeriod('24h');
  comparisonPeriod: ReconPeriod = this.makePeriod('7d');
  heatmapPeriod: ReconPeriod = this.makePeriod('24h');
  heatmapType = 'observation';

  readonly tabs: Array<{ id: ReconTab; label: string }> = [
    { id: 'areas', label: 'Райони' },
    { id: 'observations', label: 'Спостереження' },
    { id: 'impacts', label: 'Ураження' },
    { id: 'targets', label: 'Цілі' },
    { id: 'analytics', label: 'Аналітика' },
    { id: 'journal', label: 'Журнал' },
  ];

  readonly periodPresets: Array<{ value: PeriodPreset; label: string }> = [
    { value: 'today', label: 'Сьогодні' },
    { value: '24h', label: '24 год' },
    { value: '7d', label: '7 діб' },
    { value: '30d', label: '30 діб' },
    { value: 'custom', label: 'Довільно' },
  ];

  readonly sources = [
    { value: 'light_recon', label: 'Світлова розвідка' },
    { value: 'sound_recon', label: 'Звукова розвідка' },
    { value: 'counter_battery_complex', label: 'Контрбатарейний комплекс' },
    { value: 'air_recon', label: 'Аеророзвідка' },
    { value: 'allied_air_recon', label: 'Союзна аеророзвідка' },
  ];

  readonly targetTypes = [
    { value: 'mortar', label: 'Міномет' },
    { value: 'tube_artillery', label: 'Ствольна артилерія' },
    { value: 'mlrs', label: 'РСЗВ' },
  ];

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly service: ReconService,
    private readonly autoRefresh: AutoRefreshService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      const leafletModule = await import('leaflet');
      this.L = ((leafletModule as unknown as { default?: LeafletModule }).default || leafletModule) as LeafletModule;
      this.initMap();
    }

    this.load();
    this.subscription.add(
      this.autoRefresh.watch(['recon', 'map', 'analytics', 'events'], () => this.load(false)),
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.map?.remove();
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.layersOpen = false;
    if (this.draftPoint) {
      this.draftPoint = null;
      this.renderLayers();
      return;
    }
    this.closePanel();
  }

  get primarySummary(): Record<string, unknown> {
    return (this.primaryBasic.summary as Record<string, unknown> | undefined) || {};
  }

  get comparisonSummary(): Record<string, unknown> {
    return (this.comparisonBasic.summary as Record<string, unknown> | undefined) || {};
  }

  get areaComparisonRows(): Array<Record<string, unknown>> {
    return this.areaAnalytics.map((row) => ({
      id: row.areaId,
      name: row.name,
      observations: row.primary.observations,
      comparisonObservations: row.comparison.observations,
      impacts: row.primary.impacts,
      comparisonImpacts: row.comparison.impacts,
      targets: row.primary.targets,
      comparisonTargets: row.comparison.targets,
      avgThreat: row.primary.threatIndex,
    }));
  }

  get selectedAreaAnalytics(): ReconAreaAnalyticsRow | null {
    if (this.selected?.kind !== 'area') return this.areaAnalytics[0] || null;
    return this.areaAnalytics.find((item) => item.areaId === this.selected?.id) || null;
  }

  get hasAreaAnalytics(): boolean {
    return this.areaAnalytics.length > 0;
  }

  get sortedAreaAnalytics(): ReconAreaAnalyticsRow[] {
    return [...this.areaAnalytics].sort((left, right) => {
      const severityRank = { critical: 0, attention: 1, normal: 2 } as Record<string, number>;
      const severityDelta = (severityRank[left.change.severity] ?? 9) - (severityRank[right.change.severity] ?? 9);
      if (severityDelta !== 0) return severityDelta;
      return right.primary.activityIndex - left.primary.activityIndex;
    });
  }

  get areaSummaryCards(): Array<{ label: string; value: string; areaId?: string | null }> {
    const growth = [...this.areaAnalytics].sort((a, b) => b.change.percent - a.change.percent)[0];
    const decline = [...this.areaAnalytics].sort((a, b) => a.change.percent - b.change.percent)[0];
    const active = [...this.areaAnalytics].sort((a, b) => b.primary.activityIndex - a.primary.activityIndex)[0];
    const newTargets = [...this.areaAnalytics].sort((a, b) => b.primary.newTargets - a.primary.newTargets)[0];
    const puar = this.areaAnalytics.find((item) => item.recommendation === 'puar');
    const criticalCount = this.areaAnalytics.filter((item) => item.change.severity === 'critical').length;
    return [
      { label: 'Найбільше зростання', value: growth ? `${growth.name} · ${growth.change.percent}%` : '—', areaId: growth?.areaId },
      { label: 'Найбільший спад', value: decline ? `${decline.name} · ${decline.change.percent}%` : '—', areaId: decline?.areaId },
      { label: 'Найактивніший район', value: active ? `${active.name} · ${active.primary.activityIndex}` : '—', areaId: active?.areaId },
      { label: 'Найбільше нових цілей', value: newTargets ? `${newTargets.name} · ${newTargets.primary.newTargets}` : '—', areaId: newTargets?.areaId },
      { label: 'Район для ПУАР', value: puar ? puar.name : '—', areaId: puar?.areaId },
      { label: 'Критичне зростання', value: String(criticalCount), areaId: null },
    ];
  }

  get priorityTargets(): Array<Record<string, unknown>> {
    return Array.isArray(this.primaryAnalytics['priorityTargets'])
      ? (this.primaryAnalytics['priorityTargets'] as Array<Record<string, unknown>>)
      : [];
  }

  get changeBlock(): Record<string, unknown> {
    return (this.primaryAnalytics['recentChanges'] as Record<string, unknown> | undefined) || {};
  }

  get sourceEffectivenessRows(): Array<Record<string, unknown>> {
    return Array.isArray(this.primaryAnalytics['sourceEffectiveness'])
      ? (this.primaryAnalytics['sourceEffectiveness'] as Array<Record<string, unknown>>)
      : [];
  }

  get decisionFunnel(): Record<string, unknown> {
    return (this.primaryAnalytics['decisionFunnel'] as Record<string, unknown> | undefined) || {};
  }

  get conclusion(): string {
    return String(this.primaryAnalytics['conclusion'] || '');
  }

  get selectedTarget(): ReconTarget | null {
    return this.selected?.kind === 'target'
      ? this.targets.find((item) => item.id === this.selected?.id) || null
      : null;
  }

  setTab(tab: ReconTab): void {
    this.activeTab = tab;
    this.openPanel();
  }

  setBaseLayer(layer: string): void {
    this.baseLayer = layer;
    this.applyBaseLayer();
  }

  togglePanel(): void {
    this.rightPanelOpen = !this.rightPanelOpen;
    setTimeout(() => this.map?.invalidateSize(), 180);
  }

  openPanel(): void {
    if (!this.rightPanelOpen) {
      this.rightPanelOpen = true;
      setTimeout(() => this.map?.invalidateSize(), 180);
    }
  }

  closePanel(): void {
    this.rightPanelOpen = false;
    setTimeout(() => this.map?.invalidateSize(), 180);
  }

  toggleLayersMenu(): void {
    this.layersOpen = !this.layersOpen;
  }

  toggleFullscreen(): void {
    const element = document.querySelector('.recon-map-wrap') as HTMLElement | null;
    if (!element) return;
    if (!document.fullscreenElement) {
      void element.requestFullscreen?.();
      return;
    }
    void document.exitFullscreen?.();
  }

  toggleLayer(layer: keyof ReconPage['layerState']): void {
    this.layerState[layer] = !this.layerState[layer];
    this.renderLayers();
  }

  updatePeriod(period: ReconPeriod, range: PeriodPreset): void {
    const next = this.makePeriod(range);
    period.range = next.range;
    period.from = next.from;
    period.to = next.to;
    this.load(false);
  }

  savePoint(kind: 'observation' | 'impact'): void {
    const lat = this.pointForm.lat ? Number(this.pointForm.lat) : undefined;
    const lng = this.pointForm.lng ? Number(this.pointForm.lng) : undefined;
    const hasLatLng = typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
    const hasMgrs = Boolean(this.pointForm.mgrs.trim());
    const datetime = new Date(this.pointForm.datetime);

    if (!hasLatLng && !hasMgrs) {
      this.errorMessage = 'Вкажіть координати або MGRS';
      return;
    }
    if (Number.isNaN(datetime.getTime())) {
      this.errorMessage = 'Вкажіть коректний час точки';
      return;
    }

    const body: Record<string, unknown> = {
      source: this.pointForm.source,
      targetType: this.pointForm.targetType,
      lat: hasLatLng ? lat : undefined,
      lng: hasLatLng ? lng : undefined,
      mgrs: this.pointForm.mgrs.trim() || undefined,
      observationDatetime: datetime.toISOString(),
      notes: this.pointForm.notes || undefined,
    };

    if (kind === 'impact') {
      body['impactDatetime'] = datetime.toISOString();
    }

    const request: Observable<ReconImpact | ReconObservation> =
      kind === 'impact' ? this.service.createImpact(body) : this.service.createObservation(body);

    this.subscription.add(
      request.subscribe({
        next: (item) => {
          this.errorMessage = '';
          this.draftPoint = null;
          this.selectCreatedItem(kind, item);
          this.pointForm.notes = '';
          this.load(false);
        },
        error: () => {
          this.errorMessage = 'Не вдалося зберегти точку';
          this.cdr.detectChanges();
        },
      }),
    );
  }

  createTargetFromObservation(item: ReconObservation): void {
    this.subscription.add(
      this.service.createTarget({ observationId: item.id, targetType: item.targetType }).subscribe((target) => {
        this.selected = { kind: 'target', id: target.id };
        this.activeTab = 'targets';
        this.openPanel();
        this.load(false);
      }),
    );
  }

  createPuarFromTarget(target: ReconTarget): void {
    this.subscription.add(
      this.service.createPuar({ targetId: target.id }).subscribe((proposal) => {
        this.selected = { kind: 'puar', id: proposal.id };
        this.activeTab = 'puar';
        this.openPanel();
        this.load(false);
      }),
    );
  }

  createPuarFromObservation(item: ReconObservation): void {
    this.subscription.add(
      this.service.createPuar({ observationId: item.id }).subscribe((proposal) => {
        this.selected = { kind: 'puar', id: proposal.id };
        this.activeTab = 'puar';
        this.openPanel();
        this.load(false);
      }),
    );
  }

  recalculateTarget(target: ReconTarget): void {
    this.subscription.add(this.service.recalculateTarget(target.id).subscribe(() => this.load(false)));
  }

  hideTarget(target: ReconTarget): void {
    this.subscription.add(this.service.updateTargetStatus(target.id, 'hidden').subscribe(() => this.load(false)));
  }

  previewImport(): void {
    if (!this.importCsv.trim()) {
      this.errorMessage = 'Додайте CSV-файл або вставте вміст перед перевіркою';
      return;
    }

    this.importBusy = true;
    this.subscription.add(
      this.service.previewImport(this.buildImportPayload()).subscribe({
        next: (result) => {
          this.importPreview = result;
          this.importMapping = { ...(result.mapping || this.importMapping) };
          this.importBusy = false;
          this.errorMessage = '';
          this.cdr.detectChanges();
        },
        error: () => {
          this.importBusy = false;
          this.errorMessage = 'Не вдалося підготувати preview імпорту';
          this.cdr.detectChanges();
        },
      }),
    );
  }

  confirmImport(): void {
    if (!this.importCsv.trim()) {
      this.errorMessage = 'Немає CSV для імпорту';
      return;
    }

    this.importBusy = true;
    this.subscription.add(
      this.service.confirmImport(this.buildImportPayload()).subscribe({
        next: (result) => {
          this.importPreview = result;
          this.importBusy = false;
          if (!result.blockedByDuplicates) {
            this.importCsv = '';
            this.importFilename = '';
          }
          this.load(false);
        },
        error: () => {
          this.importBusy = false;
          this.errorMessage = 'Не вдалося підтвердити імпорт';
          this.cdr.detectChanges();
        },
      }),
    );
  }

  downloadImportErrors(batchId: string): void {
    this.service.downloadImportErrorsCsv(batchId).catch(() => {
      this.errorMessage = 'Не вдалося завантажити CSV з помилками імпорту';
      this.cdr.detectChanges();
    });
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    this.importFilename = file.name;
    file
      .arrayBuffer()
      .then((buffer) => {
        this.importCsv = this.decodeCsvBuffer(buffer);
        this.importPreview = null;
        this.errorMessage = '';
        this.cdr.detectChanges();
      })
      .catch(() => {
        this.errorMessage = 'Не вдалося прочитати CSV-файл';
        this.cdr.detectChanges();
      });
  }

  updateImportMapping(field: string, value: string): void {
    if (!value) {
      delete this.importMapping[field];
      return;
    }
    this.importMapping[field] = value;
  }

  importRowsPreview(): Array<Record<string, string>> {
    return this.importPreview?.sampleRows || [];
  }

  importColumns(): string[] {
    return this.importPreview?.columns || [];
  }

  recalculateCorrelations(): void {
    this.subscription.add(this.service.recalculateCorrelations().subscribe(() => this.load(false)));
  }

  acceptCorrelation(item: ReconCorrelation): void {
    this.subscription.add(this.service.acceptCorrelation(item.id).subscribe(() => this.load(false)));
  }

  rejectCorrelation(item: ReconCorrelation): void {
    this.subscription.add(this.service.rejectCorrelation(item.id).subscribe(() => this.load(false)));
  }

  applyProcessedDecision(item: ReconProcessedDecision, decision: string): void {
    this.subscription.add(
      this.service.decideProcessedTarget(item.targetId, item.observationId, decision).subscribe(() => this.load(false)),
    );
  }

  saveArea(): void {
    if (this.draftArea.length < 3) {
      this.errorMessage = 'Позначте щонайменше 3 точки району на карті';
      return;
    }

    this.subscription.add(
      this.service
        .createArea({
          name: this.areaForm.name,
          description: this.areaForm.description,
          coordinates: this.draftArea,
        })
        .subscribe({
          next: (area) => {
            this.draftArea = [];
            this.selected = { kind: 'area', id: area.id };
            this.activeTab = 'areas';
            this.load(false);
          },
          error: () => {
            this.errorMessage = 'Не вдалося створити район';
            this.cdr.detectChanges();
          },
        }),
    );
  }

  clearDraftArea(): void {
    this.draftArea = [];
    this.renderLayers();
  }

  pickArea(row: Record<string, unknown>): void {
    const area = this.areas.find((item) => item.id === row['id']);
    if (!area) return;
    this.selected = { kind: 'area', id: area.id };
    this.centerArea(area);
    this.renderLayers();
  }

  selectAreaAnalytics(row: ReconAreaAnalyticsRow): void {
    this.selected = { kind: 'area', id: row.areaId };
    const area = this.areas.find((item) => item.id === row.areaId);
    if (area) {
      this.centerArea(area);
    }
    this.activeTab = 'analytics';
    this.openPanel();
    this.renderLayers();
  }

  selectAreaAnalyticsById(areaId: string): void {
    const row = this.areaAnalytics.find((item) => item.areaId === areaId);
    if (row) this.selectAreaAnalytics(row);
  }

  selectArea(area: ReconArea): void {
    this.selected = { kind: 'area', id: area.id };
    this.renderLayers();
  }

  selectObservation(item: ReconObservation): void {
    this.selected = { kind: 'observation', id: item.id };
    this.centerPoint(item.lat, item.lng, 12);
    this.renderLayers();
  }

  selectImpact(item: ReconImpact): void {
    this.selected = { kind: 'impact', id: item.id };
    this.centerPoint(item.lat, item.lng, 12);
    this.renderLayers();
  }

  selectTarget(target: ReconTarget): void {
    this.selected = { kind: 'target', id: target.id };
    this.centerPoint(target.lat, target.lng, 11);
    this.renderLayers();
  }

  confidenceColor(target: ReconTarget): string {
    if (target.confidenceLabel === 'confirmed') return '#16a34a';
    if (target.confidenceLabel === 'high') return '#65a30d';
    if (target.confidenceLabel === 'medium') return '#ea580c';
    return '#dc2626';
  }

  sourceLabel(value: string): string {
    return this.sources.find((item) => item.value === value)?.label || value;
  }

  targetTypeLabel(value: string): string {
    return this.targetTypes.find((item) => item.value === value)?.label || value;
  }

  sourceLabelAny(value: unknown): string {
    return this.sourceLabel(String(value || ''));
  }

  targetTypeLabelAny(value: unknown): string {
    return this.targetTypeLabel(String(value || ''));
  }

  metricDelta(key: string): { primary: number; comparison: number; delta: number; percent: number | null } {
    const primary = Number(this.primarySummary[key] || 0);
    const comparison = Number(this.comparisonSummary[key] || 0);
    const delta = primary - comparison;
    return {
      primary,
      comparison,
      delta,
      percent: comparison === 0 ? null : Math.round((delta / comparison) * 100),
    };
  }

  load(showLoading = true): void {
    this.loading = showLoading;
    this.errorMessage = '';

    const primaryBounds = this.periodBounds(this.primaryPeriod);
    const comparisonBounds = this.periodBounds(this.comparisonPeriod);
    const heatmapBounds = this.periodBounds(this.heatmapPeriod);

    this.subscription.add(
      forkJoin({
        areas: this.service.getAreas().pipe(catchError(() => of([]))),
        observations: this.service.getObservations().pipe(catchError(() => of([]))),
        impacts: this.service.getImpacts().pipe(catchError(() => of([]))),
        targets: this.service.getTargets().pipe(catchError(() => of([]))),
        events: this.service.getEvents().pipe(catchError(() => of([]))),
        correlations: this.service.getCorrelations().pipe(catchError(() => of([]))),
        importHistory: this.service.getImportHistory().pipe(catchError(() => of([]))),
        puar: this.service.getPuar().pipe(catchError(() => of([]))),
        decisions: this.service.getProcessedDecisions().pipe(catchError(() => of([]))),
        primaryBasic: this.service
          .getAnalytics(this.primaryPeriod.range, primaryBounds.from, primaryBounds.to)
          .pipe(catchError(() => of({}))),
        comparisonBasic: this.service
          .getAnalytics(this.comparisonPeriod.range, comparisonBounds.from, comparisonBounds.to)
          .pipe(catchError(() => of({}))),
        areaAnalytics: this.service
          .getAreaAnalytics({
            primaryFrom: primaryBounds.from || this.periodIsoStart(this.primaryPeriod),
            primaryTo: primaryBounds.to || new Date().toISOString(),
            compareFrom: comparisonBounds.from || this.periodIsoStart(this.comparisonPeriod),
            compareTo: comparisonBounds.to || new Date().toISOString(),
            includeHistorical: this.layerState.historical,
          })
          .pipe(catchError(() => of([]))),
        primaryAnalytics: this.service
          .getFullAnalytics(this.primaryPeriod.range, primaryBounds.from, primaryBounds.to)
          .pipe(catchError(() => of({}))),
        comparisonAnalytics: this.service
          .getFullAnalytics(this.comparisonPeriod.range, comparisonBounds.from, comparisonBounds.to)
          .pipe(catchError(() => of({}))),
        dailyReport: this.service.getDailyReport().pipe(catchError(() => of({}))),
        heatmap: this.service
          .getHeatmap(this.heatmapType, this.heatmapPeriod.range, heatmapBounds.from, heatmapBounds.to)
          .pipe(catchError(() => of(null))),
      }).subscribe({
        next: (payload) => {
          this.areas = payload.areas;
          this.observations = payload.observations;
          this.impacts = payload.impacts;
          this.targets = payload.targets;
          this.events = payload.events;
          this.correlations = payload.correlations;
          this.importHistory = payload.importHistory;
          this.puarProposals = payload.puar;
          this.processedDecisions = payload.decisions;
          this.primaryBasic = payload.primaryBasic;
          this.comparisonBasic = payload.comparisonBasic;
          this.areaAnalytics = payload.areaAnalytics;
          this.primaryAnalytics = payload.primaryAnalytics;
          this.comparisonAnalytics = payload.comparisonAnalytics;
          this.dailyReport = payload.dailyReport;
          this.heatmap = payload.heatmap;
          this.loading = false;
          this.lastSyncLabel = new Date().toLocaleTimeString('uk-UA', {
            hour: '2-digit',
            minute: '2-digit',
          });
          this.renderLayers();
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.errorMessage = 'Не вдалося завантажити дані Recon';
          this.cdr.detectChanges();
        },
      }),
    );
  }

  private initMap(): void {
    if (!this.L) return;

    this.map = this.L.map('recon-map', { zoomControl: true }).setView([49.0, 36.0], 8);
    this.applyBaseLayer();

    this.areasLayer = this.L.layerGroup().addTo(this.map);
    this.observationsLayer = this.L.layerGroup().addTo(this.map);
    this.impactsLayer = this.L.layerGroup().addTo(this.map);
    this.targetsLayer = this.L.layerGroup().addTo(this.map);
    this.ellipsesLayer = this.L.layerGroup().addTo(this.map);
    this.correlationsLayer = this.L.layerGroup().addTo(this.map);
    this.heatmapLayer = this.L.layerGroup().addTo(this.map);
    this.puarLayer = this.L.layerGroup().addTo(this.map);
    this.previewLayer = this.L.layerGroup().addTo(this.map);
    this.highlightLayer = this.L.layerGroup().addTo(this.map);

    this.map.on('click', (event: LeafletMouseEvent) => this.handleMapClick(event));
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private handleMapClick(event: LeafletMouseEvent): void {
    const lat = Number(event.latlng.lat.toFixed(6));
    const lng = Number(event.latlng.lng.toFixed(6));

    if (this.clickMode === 'area') {
      this.draftArea = [...this.draftArea, [lng, lat]];
      this.renderLayers();
      return;
    }

    this.pointForm.lat = String(lat);
    this.pointForm.lng = String(lng);
    this.pointForm.mgrs = this.formatApproxMgrs(lat, lng);
    this.pointForm.datetime = this.toInputDateTime(new Date());
    this.draftPoint = {
      kind: this.clickMode,
      lat,
      lng,
      mgrs: this.pointForm.mgrs,
      source: this.pointForm.source,
      targetType: this.pointForm.targetType,
    };
    this.activeTab = this.clickMode === 'impact' ? 'impacts' : 'observations';
    this.openPanel();
    this.renderLayers();
    this.cdr.detectChanges();
  }

  private applyBaseLayer(): void {
    if (!this.L || !this.map) return;

    this.baseTile?.remove();
    const url =
      this.baseLayer === 'Topo'
        ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
        : this.baseLayer === 'Satellite'
          ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    this.baseTile = this.L.tileLayer(url, {
      maxZoom: 19,
      attribution: this.baseLayer === 'Satellite' ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap',
    }).addTo(this.map);
  }

  private renderLayers(): void {
    if (!this.L || !this.map) return;

    this.areasLayer?.clearLayers();
    this.observationsLayer?.clearLayers();
    this.impactsLayer?.clearLayers();
    this.targetsLayer?.clearLayers();
    this.ellipsesLayer?.clearLayers();
    this.correlationsLayer?.clearLayers();
    this.heatmapLayer?.clearLayers();
    this.puarLayer?.clearLayers();
    this.previewLayer?.clearLayers();
    this.highlightLayer?.clearLayers();

    if (this.layerState.areas) this.renderAreas();
    if (this.layerState.observations) this.renderObservations();
    if (this.layerState.impacts) this.renderImpacts();
    if (this.layerState.targets) this.renderTargets();
    if (this.layerState.ellipses) this.renderTargetEllipses();
    if (this.layerState.correlations) this.renderCorrelations();
    if (this.layerState.heatmap) this.renderHeatmap();
    if (this.layerState.puar) this.renderPuar();
    this.renderPreview();
    this.renderHighlight();
  }

  private renderAreas(): void {
    for (const area of this.areas) {
      const ring = area.geometry?.coordinates?.[0]?.map((point) => [point[1], point[0]] as [number, number]) || [];
      if (ring.length < 3) continue;
      const analytics = this.areaAnalytics.find((item) => item.areaId === area.id) || null;
      const color = this.areaDisplayColor(area.id, analytics);
      const selected = this.selected?.kind === 'area' && this.selected.id === area.id;
      this.L!
        .polygon(ring, {
          color,
          weight: selected ? 4 : 2,
          fillColor: color,
          fillOpacity: selected ? 0.36 : this.layerState.analyticalColoring ? 0.28 : 0.22,
        })
        .bindTooltip(this.areaLabel(area.name, analytics), {
          permanent: true,
          direction: 'center',
          className: 'recon-area-label',
        })
        .bindPopup(this.areaPopup(area, analytics))
        .on('click', () => {
          this.selected = { kind: 'area', id: area.id };
          this.activeTab = 'analytics';
          this.openPanel();
          this.cdr.detectChanges();
          this.renderLayers();
        })
        .addTo(this.areasLayer!);
    }

    if (this.draftArea.length > 0) {
      const draft = this.draftArea.map((point) => [point[1], point[0]] as [number, number]);
      if (draft.length === 1) {
        this.L!.circleMarker(draft[0], {
          radius: 7,
          color: '#facc15',
          fillColor: '#facc15',
          fillOpacity: 0.9,
        }).addTo(this.areasLayer!);
      } else {
        this.L!.polyline(draft, { color: '#facc15', weight: 2, dashArray: '6 6' }).addTo(this.areasLayer!);
      }
    }
  }

  private renderObservations(): void {
    for (const item of this.filteredObservations()) {
      const selected = this.selected?.kind === 'observation' && this.selected.id === item.id;
      this.L!
        .marker([item.lat, item.lng], {
          icon: this.L!.divIcon({
            className: 'recon-milsymbol-icon observation-icon',
            html: this.milsymbolHtml('observation', item.targetType, item.source, selected ? '#f8fafc' : '#ef4444'),
            iconSize: [54, 54],
            iconAnchor: [27, 27],
          }),
          zIndexOffset: selected ? 2000 : 900,
        })
        .bindTooltip(this.pointTooltip('Спостереження', item.source, item.targetType, item.observationDatetime, item.mgrs, item.status, item.notes))
        .on('click', () => {
          this.selected = { kind: 'observation', id: item.id };
          this.activeTab = 'observations';
          this.openPanel();
          this.cdr.detectChanges();
          this.renderLayers();
        })
        .addTo(this.observationsLayer!);
    }
  }

  private renderImpacts(): void {
    for (const item of this.filteredImpacts()) {
      const selected = this.selected?.kind === 'impact' && this.selected.id === item.id;
      this.L!
        .marker([item.lat, item.lng], {
          icon: this.L!.divIcon({
            className: 'recon-impact-symbol',
            html: `<span class="${selected ? 'is-selected' : ''}">✹</span>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
          zIndexOffset: selected ? 2200 : 1000,
        })
        .bindTooltip(this.pointTooltip('Ураження', item.source, item.targetType, item.impactDatetime, item.mgrs, item.status, item.notes))
        .on('click', () => {
          this.selected = { kind: 'impact', id: item.id };
          this.activeTab = 'impacts';
          this.openPanel();
          this.cdr.detectChanges();
          this.renderLayers();
        })
        .addTo(this.impactsLayer!);
    }
  }

  private renderTargets(): void {
    for (const target of this.filteredTargets()) {
      const color = this.confidenceColor(target);
      const selected = this.selected?.kind === 'target' && this.selected.id === target.id;
      this.L!
        .marker([target.lat, target.lng], {
          icon: this.L!.divIcon({
            className: 'recon-milsymbol-icon target-icon',
            html: this.milsymbolHtml('target', target.targetType, target.status, color),
            iconSize: [64, 64],
            iconAnchor: [32, 32],
          }),
          zIndexOffset: selected ? 2400 : 1200,
        })
        .bindTooltip(
          this.pointTooltip(
            'Ціль',
            target.status,
            target.targetType,
            target.updatedAt || target.createdAt || '',
            target.mgrs,
            `${target.confidenceLabel} / ${target.status}`,
            `Довіра ${target.confidenceIndex}, активність ${target.activityIndex}, свіжість ${target.freshnessIndex}`,
          ),
        )
        .on('click', () => {
          this.selected = { kind: 'target', id: target.id };
          this.activeTab = 'targets';
          this.openPanel();
          this.cdr.detectChanges();
          this.renderLayers();
        })
        .addTo(this.targetsLayer!);
    }
  }

  private renderTargetEllipses(): void {
    for (const target of this.filteredTargets()) {
      const color = this.confidenceColor(target);
      const selected = this.selected?.kind === 'target' && this.selected.id === target.id;
      this.L!
        .polygon(this.ellipsePoints(target.lat, target.lng, target.semiMajorM || 250, target.semiMinorM || 120, target.azimuthDeg || 0), {
          color,
          weight: selected ? 3 : 2,
          dashArray: this.targetStatusDashArray(target.status),
          fillColor: color,
          fillOpacity: selected ? 0.16 : 0.08,
        })
        .addTo(this.ellipsesLayer!);
    }
  }

  private renderCorrelations(): void {
    for (const item of this.correlations) {
      const target = this.targets.find((candidate) => candidate.id === item.targetId);
      const impact = this.impacts.find((candidate) => candidate.id === item.impactId);
      if (!target || !impact) continue;
      const color = item.status === 'accepted' ? '#22c55e' : item.status === 'rejected' ? '#64748b' : '#facc15';
      this.L!
        .polyline(
          [
            [target.lat, target.lng],
            [impact.lat, impact.lng],
          ],
          { color, weight: 2, dashArray: '8 8', opacity: 0.86 },
        )
        .bindTooltip(`Кореляція ${item.score} · ${item.status}`)
        .addTo(this.correlationsLayer!);
    }
  }

  private renderHeatmap(): void {
    for (const point of this.heatmap?.points || []) {
      const intensity = Math.max(10, Math.min(42, Number(point.intensity || point.count || 1)));
      this.L!
        .circle([point.lat, point.lng], {
          radius: intensity * 55,
          color: '#f97316',
          weight: 1,
          fillColor: '#f97316',
          fillOpacity: 0.18,
        })
        .addTo(this.heatmapLayer!);
    }
  }

  private renderPuar(): void {
    for (const item of this.puarProposals) {
      const target = item.targetId ? this.targets.find((candidate) => candidate.id === item.targetId) : null;
      const observation = item.observationId
        ? this.observations.find((candidate) => candidate.id === item.observationId)
        : null;
      const lat = target?.lat ?? observation?.lat;
      const lng = target?.lng ?? observation?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      this.L!
        .circleMarker([lat, lng], {
          radius: 8,
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: 0.85,
          weight: 2,
        })
        .bindTooltip(`ПУАР · ${item.status}`)
        .addTo(this.puarLayer!);
    }
  }

  private renderPreview(): void {
    if (!this.draftPoint || !this.previewLayer || !this.L) return;

    const point: LeafletLatLngExpression = [this.draftPoint.lat, this.draftPoint.lng];
    this.L!.marker(point, {
      icon: this.L!.divIcon({
        className: 'recon-crosshair-icon',
        html: '<span>+</span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      zIndexOffset: 3000,
    }).addTo(this.previewLayer);

    if (this.draftPoint.kind === 'impact') {
      this.L!.marker(point, {
        icon: this.L!.divIcon({
          className: 'recon-impact-symbol preview-impact',
          html: '<span>✹</span>',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        zIndexOffset: 3050,
      }).addTo(this.previewLayer);
      return;
    }

    this.L!.marker(point, {
      icon: this.L!.divIcon({
        className: 'recon-milsymbol-icon preview-observation',
        html: this.milsymbolHtml('observation', this.draftPoint.targetType, this.draftPoint.source, '#f8fafc'),
        iconSize: [54, 54],
        iconAnchor: [27, 27],
      }),
      zIndexOffset: 3050,
    }).addTo(this.previewLayer);
  }

  private renderHighlight(): void {
    if (!this.highlightedId || !this.highlightLayer || !this.L) return;

    const observation = this.observations.find((item) => item.id === this.highlightedId);
    if (observation) {
      this.L!.circleMarker([observation.lat, observation.lng], {
        radius: 18,
        color: '#f8fafc',
        weight: 2,
        fillOpacity: 0,
      }).addTo(this.highlightLayer);
      return;
    }

    const impact = this.impacts.find((item) => item.id === this.highlightedId);
    if (impact) {
      this.L!.circleMarker([impact.lat, impact.lng], {
        radius: 20,
        color: '#f8fafc',
        weight: 2,
        fillOpacity: 0,
      }).addTo(this.highlightLayer);
      return;
    }

    const target = this.targets.find((item) => item.id === this.highlightedId);
    if (target) {
      this.L!.circle([target.lat, target.lng], {
        radius: Math.max(220, target.semiMajorM || 250),
        color: '#f8fafc',
        weight: 2,
        fillOpacity: 0,
      }).addTo(this.highlightLayer);
    }
  }

  private filteredObservations(): ReconObservation[] {
    return this.layerState.historical ? this.observations : this.observations.filter((item) => item.status !== 'hidden' && item.status !== 'archived');
  }

  private filteredImpacts(): ReconImpact[] {
    return this.layerState.historical ? this.impacts : this.impacts.filter((item) => item.status !== 'hidden' && item.status !== 'archived');
  }

  private filteredTargets(): ReconTarget[] {
    return this.layerState.historical ? this.targets : this.targets.filter((item) => item.status !== 'hidden' && item.status !== 'stale');
  }

  private pointTooltip(
    typeLabel: string,
    sourceLabel: string,
    targetType: string,
    time: string,
    mgrs: string,
    status: string,
    comment?: string | null,
  ): string {
    return [
      `<strong>${typeLabel}</strong>`,
      `${this.targetTypeLabel(targetType)} · ${sourceLabel}`,
      time ? new Date(time).toLocaleString('uk-UA') : '',
      mgrs ? `MGRS: ${mgrs}` : '',
      status ? `Статус: ${status}` : '',
      comment ? `Коментар: ${comment}` : '',
    ]
      .filter(Boolean)
      .join('<br>');
  }

  private areaPopup(area: ReconArea, analytics?: ReconAreaAnalyticsRow | null): string {
    const lines = [
      `<strong>${area.name}</strong>`,
      area.description || '',
      `??????: ${area.status}`,
    ];
    if (analytics) {
      lines.push(`??????????: ${Math.round(analytics.primary.activityIndex)}`);
      lines.push(`?????: ${analytics.change.percent}%`);
      lines.push(`?????????????: ${analytics.primary.observations}`);
      lines.push(`????: ${analytics.primary.targets}`);
      lines.push(`????????????: ${analytics.recommendation}`);
    }
    return lines.filter(Boolean).join('<br>');
  }

  private areaLabel(name: string, analytics?: ReconAreaAnalyticsRow | null): string {
    if (!analytics || !this.layerState.analyticalColoring) return name;
    const activity = Math.round(analytics.primary.activityIndex || 0);
    const delta = analytics.change.percent > 0 ? `+${analytics.change.percent}` : `${analytics.change.percent}`;
    return `${name}<br>${activity} ? ${delta}%`;
  }

  private selectCreatedItem(kind: 'observation' | 'impact', item: ReconObservation | ReconImpact): void {
    const id = item.id;
    this.highlightedId = id;
    this.selected = {
      kind: kind === 'impact' ? 'impact' : 'observation',
      id,
    };
    this.activeTab = kind === 'impact' ? 'impacts' : 'observations';
    this.openPanel();
    this.centerPoint(Number(item.lat), Number(item.lng), 12);
    setTimeout(() => {
      this.highlightedId = '';
      this.renderLayers();
    }, 5000);
  }

  private centerPoint(lat: number, lng: number, zoom = 11): void {
    this.map?.setView([lat, lng], zoom, { animate: true });
  }

  private centerArea(area: ReconArea): void {
    const ring = area.geometry?.coordinates?.[0]?.map((point) => [point[1], point[0]] as [number, number]) || [];
    if (ring.length === 0 || !this.L || !this.map) return;
    const bounds = this.L.latLngBounds(ring);
    this.map.fitBounds(bounds.pad(0.25));
  }

  private milsymbolHtml(kind: 'observation' | 'target', targetType: string, descriptor: string, color: string): string {
    const sidc = this.sidcFor(kind, targetType);
    const label = kind === 'target' ? this.targetTypeBadge(targetType) : this.sourceBadge(descriptor);
    const svg = new ms.Symbol(sidc, {
      size: kind === 'target' ? 44 : 36,
      standard: 'APP6',
      frame: true,
      fill: true,
      icon: true,
      uniqueDesignation: '',
      higherFormation: '',
      additionalInformation: '',
      staffComments: '',
      direction: undefined,
    })
      .asSVG()
      .replace(/fill="rgb\(255,128,128\)"/g, 'fill="rgba(255,128,128,0.12)"')
      .replace(/fill="#FF8080"/gi, 'fill="rgba(255,128,128,0.12)"')
      .replace(/fill="black"/gi, `fill="${color}"`)
      .replace(/stroke="black"/gi, `stroke="${color}"`);

    return `<span class="recon-symbol-wrap">${svg}<span class="recon-symbol-badge">${label}</span></span>`;
  }

  private sidcFor(kind: 'observation' | 'target', targetType: string): string {
    const affiliation = kind === 'target' ? 'H' : 'H';
    if (targetType === 'mlrs') return `S${affiliation}GPUCR-----`;
    if (targetType === 'tube_artillery') return `S${affiliation}GPUCF-----`;
    return `S${affiliation}GPUCFM----`;
  }

  private sourceBadge(source: string): string {
    if (source === 'counter_battery_complex') return 'КБ';
    if (source === 'sound_recon') return 'ЗВ';
    if (source === 'air_recon') return 'АР';
    if (source === 'allied_air_recon') return 'СА';
    return 'СР';
  }

  private targetTypeBadge(type: string): string {
    if (type === 'mlrs') return 'РСЗВ';
    if (type === 'tube_artillery') return 'АРТ';
    return 'М';
  }

  private ellipsePoints(lat: number, lng: number, semiMajorM: number, semiMinorM: number, azimuthDeg: number): [number, number][] {
    const points: [number, number][] = [];
    const rad = (azimuthDeg * Math.PI) / 180;
    const latScale = 111320;
    const lngScale = Math.max(1, 111320 * Math.cos((lat * Math.PI) / 180));

    for (let degree = 0; degree <= 360; degree += 12) {
      const angle = (degree * Math.PI) / 180;
      const x = semiMajorM * Math.cos(angle);
      const y = semiMinorM * Math.sin(angle);
      const rx = x * Math.cos(rad) - y * Math.sin(rad);
      const ry = x * Math.sin(rad) + y * Math.cos(rad);
      points.push([lat + ry / latScale, lng + rx / lngScale]);
    }

    return points;
  }

  private targetStatusDashArray(status: string): string | undefined {
    if (status === 'confirmed') return undefined;
    if (status === 'needs_recon') return '12 6';
    if (status === 'processed') return '4 6';
    if (status === 'false_target') return '2 6';
    return '8 5';
  }

  private areaColor(id: string): string {
    const palette = ['#1d4ed8', '#0f766e', '#9a3412', '#7c3aed', '#15803d', '#b45309', '#be123c', '#0e7490'];
    let hash = 0;
    for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
  }

  private areaDisplayColor(id: string, analytics?: ReconAreaAnalyticsRow | null): string {
    const base = this.areaColor(id);
    if (!analytics || !this.layerState.analyticalColoring) return base;
    if (analytics.change.severity === 'critical') return '#ef4444';
    if (analytics.change.severity === 'attention') return '#f59e0b';
    return base;
  }

  private formatApproxMgrs(lat: number, lng: number): string {
    const zone = Math.floor((lng + 180) / 6) + 1;
    const bands = 'CDEFGHJKLMNPQRSTUVWX';
    const bandIndex = Math.max(0, Math.min(bands.length - 1, Math.floor((lat + 80) / 8)));
    const band = bands[bandIndex] || '-';
    return `${zone}${band} · приблизний MGRS`;
  }

  private buildImportPayload(): {
    csv: string;
    filename?: string;
    source?: string;
    targetTypeOverride?: string;
    duplicateStrategy?: string;
    mapping?: Record<string, string>;
  } {
    return {
      csv: this.importCsv,
      filename: this.importFilename || undefined,
      source: this.importSource || undefined,
      targetTypeOverride: this.importTargetTypeOverride || undefined,
      duplicateStrategy: this.importDuplicateStrategy,
      mapping: Object.keys(this.importMapping).length > 0 ? this.importMapping : undefined,
    };
  }

  private decodeCsvBuffer(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const utf8 = this.safeDecode(bytes, 'utf-8');
    if (utf8 && !utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '');

    const win1251 = this.safeDecode(bytes, 'windows-1251');
    if (win1251) return win1251.replace(/^\uFEFF/, '');

    return utf8 || '';
  }

  private safeDecode(bytes: Uint8Array, encoding: string): string {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch {
      return '';
    }
  }

  private periodIsoStart(period: ReconPeriod): string {
    if (period.range === 'custom' && period.from) {
      return new Date(period.from).toISOString();
    }
    const resolved = this.makePeriod(period.range);
    return new Date(resolved.from).toISOString();
  }

  private makePeriod(range: PeriodPreset): ReconPeriod {
    const now = new Date();
    const from = new Date(now);
    if (range === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (range === '7d') {
      from.setTime(now.getTime() - 7 * 86400000);
    } else if (range === '30d') {
      from.setTime(now.getTime() - 30 * 86400000);
    } else {
      from.setTime(now.getTime() - 86400000);
    }
    return {
      range,
      from: this.toInputDateTime(from),
      to: this.toInputDateTime(now),
    };
  }

  private periodBounds(period: ReconPeriod): { from?: string; to?: string } {
    if (period.range !== 'custom') return {};
    return {
      from: period.from ? new Date(period.from).toISOString() : undefined,
      to: period.to ? new Date(period.to).toISOString() : undefined,
    };
  }

  private toInputDateTime(value: Date): string {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
}
