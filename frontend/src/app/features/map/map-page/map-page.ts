import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import type * as Leaflet from 'leaflet';
import { ActivatedRoute, Router } from '@angular/router';
import { AirThreat } from '../../air-threats/air-threat.model';
import { AirThreatsService } from '../../air-threats/air-threats.service';
import { FirePosition } from '../../fire-positions/fire-position.model';
import { FirePositionsService } from '../../fire-positions/fire-positions.service';
import { FormsModule } from '@angular/forms';
import { FirePositionCard } from '../../fire-positions/fire-position-card.model';
import { ServiceOrdersService } from '../../service-orders/service-orders.service';
import { ServiceOrderMapResult } from '../../service-orders/service-order-map-result.model';
import { ServiceOrder } from '../../service-orders/service-order.model';
import { EventFeedService } from '../../../core/event-feed.service';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-map-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map-page.html',
  styleUrl: './map-page.css',
})
export class MapPage implements AfterViewInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private mapObjectsRequest?: Subscription;
private mapResultsRequest?: Subscription;
private activeOrdersRequest?: Subscription;
private positionCardRequest?: Subscription;
private readonly liveMarkerTimers = new Map<string, number>();
  private readonly mapFilterKey = 'euclida_map_filters';
  private L!: typeof Leaflet;
  private map!: Leaflet.Map;

selectedPositionCard: FirePositionCard | null = null;

mapResults: ServiceOrderMapResult[] = [];
private resultMarkersLayer!: Leaflet.LayerGroup;
private focusLayer!: Leaflet.LayerGroup;
private readonly markerAnimationMs = 5200;
private readonly previousPositionSignatures = new Map<string, string>();
private readonly previousThreatSignatures = new Map<string, string>();
private readonly liveMarkerKeys = new Set<string>();
private readonly activeFirePositionIds = new Set<string>();

clickedLat: number | null = null;
clickedLng: number | null = null;
cursorLat: number | null = null;
cursorLng: number | null = null;
cursorMgrs = '-';
cursorElevation = 'DEM недоступний';
mapMenuVisible = false;
  errorMessage = '';
  isMapLoading = false;
  hasMapLoaded = false;
  threatFormVisible = false;
threatType = '';
selectedThreat: AirThreat | null = null;
selectedPosition: FirePosition | null = null;
activeOrders: ServiceOrder[] = [];
focusedOrderNumber = '';
focusedOrderTarget: { lat: number; lng: number } | null = null;

private positionsLayer!: Leaflet.LayerGroup;
private threatsLayer!: Leaflet.LayerGroup;
private sectorsLayer!: Leaflet.LayerGroup;

showSectors = false;
showPositions = true;
showThreats = true;
showResults = false;
resultHistoryRange: 'today' | '7' | 'all' = 'today';
mapPreset: 'ops' | 'planning' | 'logistics' | 'analysis' = 'ops';
readinessFilter = '';
resultTypeFilter = '';

positionsCount = 0;
readyCount = 0;
inProgressCount = 0;
notReadyCount = 0;
threatsCount = 0;
measureMode = false;
measureStart: { lat: number; lng: number } | null = null;
measureEnd: { lat: number; lng: number } | null = null;
measureDistanceM: number | null = null;
private measureLayer!: Leaflet.LayerGroup;




  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly firePositionsService: FirePositionsService,
    private readonly airThreatsService: AirThreatsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly serviceOrdersService: ServiceOrdersService,
    private readonly eventFeed: EventFeedService,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.L = await import('leaflet');
    this.restoreMapFilters();

    this.initMap();
    this.loadMapObjects();
    this.loadActiveOrders();
    this.autoRefreshSubscription.add(
      this.route.queryParamMap.subscribe((params) => {
        if (params.get('preset') === 'active') {
          this.applyLayerPreset('ops');
        }

        this.focusOrderFromParams(params);
      }),
    );
    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['all', 'map', 'missions', 'threats', 'weapons'], () => {
        this.loadMapObjects();
        this.loadMapResults();
        this.loadActiveOrders();
      }),
    );
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.mapObjectsRequest?.unsubscribe();
    this.mapResultsRequest?.unsubscribe();
    this.activeOrdersRequest?.unsubscribe();
    this.positionCardRequest?.unsubscribe();
    this.liveMarkerTimers.forEach((timer) => clearTimeout(timer));
    this.liveMarkerTimers.clear();
    this.map?.remove();
  }

  private initMap(): void {
    this.map = this.L.map('work-map').setView([49.0, 36.0], 8);

    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);

    this.positionsLayer = this.L.layerGroup().addTo(this.map);
    this.threatsLayer = this.L.layerGroup().addTo(this.map);
    this.sectorsLayer = this.L.layerGroup().addTo(this.map);
    this.resultMarkersLayer = this.L.layerGroup().addTo(this.map);
    this.focusLayer = this.L.layerGroup().addTo(this.map);
    this.measureLayer = this.L.layerGroup().addTo(this.map);
this.updateMapZoomClass();
this.map.on('zoomend', () => this.updateMapZoomClass());
this.loadMapResults();
    this.map.on('mousemove', (event: Leaflet.LeafletMouseEvent) => {
  this.cursorLat = Number(event.latlng.lat.toFixed(6));
  this.cursorLng = Number(event.latlng.lng.toFixed(6));
  this.cursorMgrs = this.formatApproxMgrs(this.cursorLat, this.cursorLng);
  this.cdr.detectChanges();
});

this.map.on('click', (event: Leaflet.LeafletMouseEvent) => {
  const lat = Number(event.latlng.lat.toFixed(6));
  const lng = Number(event.latlng.lng.toFixed(6));

  if (this.measureMode) {
    this.handleMeasureClick(lat, lng);
    return;
  }

  this.clickedLat = lat;
  this.clickedLng = lng;
  this.mapMenuVisible = true;
  this.selectedPosition = null;
  this.cdr.detectChanges();
});
  }

 private loadMapObjects(): void {
  this.mapObjectsRequest?.unsubscribe();
  this.errorMessage = '';
  this.isMapLoading = !this.hasMapLoaded;
  this.cdr.detectChanges();

  this.mapObjectsRequest = forkJoin({
    positions: this.firePositionsService.getAllForMap(),
    threats: this.airThreatsService.getAll(),
  }).subscribe({
    next: ({ positions, threats }) => {
      this.sectorsLayer.clearLayers();
      this.positionsLayer.clearLayers();
      this.threatsLayer.clearLayers();

      this.positionsCount = positions.length;
      this.readyCount = positions.filter((x) => x.readinessStatus === 'ready').length;
      this.inProgressCount = positions.filter((x) => x.readinessStatus === 'in_progress').length;
      this.notReadyCount = positions.filter((x) => x.readinessStatus === 'not_ready').length;

      this.markUpdatedPositions(positions);

      positions
        .filter((position) => !this.readinessFilter || position.readinessStatus === this.readinessFilter)
        .forEach((position) => this.addFirePositionMarker(position));

      const activeThreats = threats.filter((threat) => threat.isActive);
      this.threatsCount = activeThreats.length;

      this.markUpdatedThreats(activeThreats);
      activeThreats.forEach((threat) => this.addThreatMarker(threat));

      this.hasMapLoaded = true;
      this.isMapLoading = false;
      this.cdr.detectChanges();
    },
    error: (error) => {
      this.isMapLoading = false;
      this.fail(error, 'Не вдалося завантажити карту');
    },
  });
}

private addFirePositionMarker(position: FirePosition): void {
    if (position.lat === null || position.lng === null) {
      return;
    }

    const color = this.getReadinessColor(position.readinessStatus);

   const marker = this.L.marker([position.lat, position.lng], {
  icon: this.createPositionIcon(position),
});

    marker.bindTooltip(this.getFirePositionLabel(position), { direction: 'top', offset: [0, -18], opacity: 0.92 });

   marker.on('click', () => {
  this.selectedPosition = position;
this.loadPositionCard(position.id);
  this.selectedThreat = null;
  this.mapMenuVisible = false;
  this.threatFormVisible = false;

  if (!this.showSectors) {
    this.sectorsLayer.clearLayers();
    this.addSector(position);
  }

  this.cdr.detectChanges();
});

    marker.addTo(this.positionsLayer);
    if (this.showSectors) {
  this.addSector(position);
}
  }

 private addThreatMarker(threat: AirThreat): void {
  const marker = this.L.marker([threat.lat, threat.lng], {
  icon: this.createThreatIcon(threat),
});

  marker.bindTooltip(`Загроза: ${threat.threatType}`);

  marker.on('click', () => {
    this.selectedThreat = threat;
    this.selectedPosition = null;
    this.mapMenuVisible = false;
    this.threatFormVisible = false;
    this.cdr.detectChanges();
  });

  marker.addTo(this.threatsLayer);
}

  private getReadinessColor(status: string): string {
    if (status === 'ready') return '#00ff88';
    if (status === 'in_progress') return '#ffd400';
    if (status === 'not_ready') return '#ff4040';

    return '#6b7280';
  }

  private fail(error: unknown, message: string): void {
      this.errorMessage = message;
    this.cdr.detectChanges();
  }
 

hideMapMenu(): void {
  this.mapMenuVisible = false;
}

startCreateTarget(): void {
  if (this.clickedLat === null || this.clickedLng === null) {
    return;
  }

  this.mapMenuVisible = false;
  void this.router.navigate(['/service-orders'], {
    queryParams: {
      create: 'true',
      lat: this.clickedLat,
      lng: this.clickedLng,
    },
  });
}

startCreateThreat(): void {
  this.threatType = '';
  this.threatFormVisible = true;
  this.mapMenuVisible = false;
}
cancelThreatForm(): void {
  this.threatFormVisible = false;
  this.threatType = '';
}

saveThreat(): void {
  if (this.clickedLat === null || this.clickedLng === null || !this.threatType.trim()) {
    return;
  }

  this.airThreatsService.create({
    threatType: this.threatType.trim(),
    lat: this.clickedLat,
    lng: this.clickedLng,
  }).subscribe({
    next: () => {
  this.eventFeed.add({
    type: 'warning',
    title: `Створено мітку загрози: ${this.threatType.trim()}`,
    details: `Координати: ${this.clickedLat}, ${this.clickedLng}`,
    route: '/map',
    queryParams: {
      lat: this.clickedLat || 0,
      lng: this.clickedLng || 0,
      orderNumber: this.threatType.trim(),
    },
  });
  this.threatFormVisible = false;
  this.threatType = '';
  this.selectedThreat = null;
  this.selectedPosition = null;
  this.loadMapObjects();
},
    error: (error) => this.fail(error, 'Не вдалося створити мітку загрози'),
  });
  
}

editSelectedPosition(): void {
  if (!this.selectedPosition) {
    return;
  }

  void this.router.navigate(['/fire-positions'], {
    queryParams: {
      editId: this.selectedPosition.id,
      returnTo: 'map',
    },
  });
}

closeThreatPanel(): void {
  this.selectedThreat = null;
}

removeSelectedThreat(): void {
  if (!this.selectedThreat) {return;}

  this.airThreatsService.delete(this.selectedThreat.id).subscribe({
    next: () => {
  this.eventFeed.add({
    type: 'warning',
    title: `Видалено мітку загрози: ${this.selectedThreat?.threatType || '-'}`,
    details: `Координати: ${this.selectedThreat?.lat || '-'}, ${this.selectedThreat?.lng || '-'}`,
    route: '/map',
  });
  this.selectedThreat = null;
  this.selectedPosition = null;
  this.loadMapObjects();
},
    error: (error) => this.fail(error, 'Не вдалося видалити мітку загрози'),
  });
}

private addSector(position: FirePosition): void {
  const radiusM = position.maxSectorDistanceM && position.maxSectorDistanceM > 0
    ? position.maxSectorDistanceM
    : 3000;

  if (
    position.lat === null ||
    position.lng === null ||
    position.sectorLeftDegrees === null ||
    position.sectorRightDegrees === null
  ) {
    return;
  }

  const points = this.buildSectorPoints(
    position.lat,
    position.lng,
    position.sectorLeftDegrees,
    position.sectorRightDegrees,
    radiusM,
  );

  this.L.polygon(points, {
  color: '#a855f7',
  weight: 3,
  opacity: 1,

  fillColor: '#9333ea',
  fillOpacity: 0.28,
}).addTo(this.sectorsLayer);
this.L.polyline(points, {
  color: '#c084fc',
  weight: 4,
  opacity: 0.95,
}).addTo(this.sectorsLayer);
}

private buildSectorPoints(
  lat: number,
  lng: number,
  leftDeg: number,
  rightDeg: number,
  radiusM: number,
): Leaflet.LatLngExpression[] {
  const points: Leaflet.LatLngExpression[] = [[lat, lng]];
  const step = 2;

  let start = leftDeg;
  let end = rightDeg;

  if (end < start) {
    end += 360;
  }

  for (let angle = start; angle <= end; angle += step) {
    points.push(this.destinationPoint(lat, lng, angle % 360, radiusM));
  }

  points.push(this.destinationPoint(lat, lng, end % 360, radiusM));
  points.push([lat, lng]);

  return points;
}

private destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceM: number,
): Leaflet.LatLngExpression {
  const earthRadiusM = 6371000;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const angularDistance = distanceM / earthRadiusM;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}
togglePositions(): void {
  this.showPositions = !this.showPositions;
  this.saveMapFilters();

  if (this.showPositions) {
    this.positionsLayer.addTo(this.map);
  } else {
    this.positionsLayer.remove();
  }
}

toggleThreats(): void {
  this.showThreats = !this.showThreats;
  this.saveMapFilters();

  if (this.showThreats) {
    this.threatsLayer.addTo(this.map);
  } else {
    this.threatsLayer.remove();
  }
}

toggleSectors(): void {
  this.showSectors = !this.showSectors;
  this.saveMapFilters();
  this.loadMapObjects();
}

toggleResults(): void {
  this.showResults = !this.showResults;
  this.saveMapFilters();

  if (this.showResults) {
    this.resultMarkersLayer.addTo(this.map);
  } else {
    this.resultMarkersLayer.remove();
  }

  this.renderMapResults();
}

applyLayerPreset(preset: 'ops' | 'planning' | 'logistics' | 'analysis'): void {
  this.mapPreset = preset;

  if (preset === 'ops') {
    this.showPositions = true;
    this.showThreats = true;
    this.showSectors = false;
    this.showResults = false;
    this.readinessFilter = '';
    this.resultTypeFilter = '';
  }

  if (preset === 'planning') {
    this.showPositions = true;
    this.showThreats = true;
    this.showSectors = true;
    this.showResults = false;
    this.readinessFilter = 'ready';
    this.resultTypeFilter = '';
  }

  if (preset === 'logistics') {
    this.showPositions = true;
    this.showThreats = false;
    this.showSectors = false;
    this.showResults = false;
    this.readinessFilter = '';
    this.resultTypeFilter = '';
  }

  if (preset === 'analysis') {
    this.showPositions = false;
    this.showThreats = true;
    this.showSectors = false;
    this.showResults = true;
    this.resultHistoryRange = '7';
    this.readinessFilter = '';
    this.resultTypeFilter = '';
  }

  this.syncLayerVisibility();
  this.saveMapFilters();
  this.loadMapObjects();
  this.renderMapResults();
}

applyMapFilters(): void {
  this.saveMapFilters();
  this.loadMapObjects();
  this.renderMapResults();
}

refreshMap(): void {
  this.loadMapObjects();
  this.loadMapResults();
  this.loadActiveOrders();
}

closeAllPanels(): void {
  this.selectedPosition = null;
  this.selectedPositionCard = null;
  this.selectedThreat = null;
  this.mapMenuVisible = false;
  this.threatFormVisible = false;
  this.focusedOrderNumber = '';
  this.focusedOrderTarget = null;
  this.focusLayer.clearLayers();
  this.cdr.detectChanges();
}
private createPositionIcon(position: FirePosition): Leaflet.DivIcon {
  const color = this.getReadinessColor(position.readinessStatus);
  const label = this.escapeHtml(this.getFirePositionLabel(position));
  const shortLabel = this.escapeHtml(this.getFirePositionShortUnit(position));
  const classes = [
    'position-marker-wrap',
    this.liveMarkerKeys.has(this.getPositionMarkerKey(position.id)) ? 'is-live-update' : '',
    this.activeFirePositionIds.has(position.id) || position.readinessStatus === 'in_progress' ? 'is-active-task' : '',
  ].filter(Boolean).join(' ');

  return this.L.divIcon({
    className: 'custom-position-marker',
    html: `
      <div class="${classes}">
        <div class="marker-pulse" style="--marker-color: ${color}">
          <div class="marker-core"></div>
        </div>
        <div class="position-map-label">
          <span class="position-label-full">${label}</span>
          <span class="position-label-short">${shortLabel}</span>
        </div>
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  });
}

private createThreatIcon(threat?: AirThreat): Leaflet.DivIcon {
  const classes = [
    'threat-marker',
    threat && this.liveMarkerKeys.has(this.getThreatMarkerKey(threat.id)) ? 'is-live-update' : '',
  ].filter(Boolean).join(' ');

  return this.L.divIcon({
    className: 'custom-threat-marker',
    html: `
      <div class="${classes}">
        !
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

private loadPositionCard(id: string): void {
  this.positionCardRequest?.unsubscribe();

  this.positionCardRequest = this.firePositionsService.getCard(id).subscribe({
    next: (card) => {
  this.selectedPositionCard = card;

  if (!this.showSectors && this.selectedPosition) {
    this.sectorsLayer.clearLayers();
    const radiusM =
  card.maxSectorDistanceM && card.maxSectorDistanceM > 0
    ? card.maxSectorDistanceM
    : this.selectedPosition.maxSectorDistanceM && this.selectedPosition.maxSectorDistanceM > 0
      ? this.selectedPosition.maxSectorDistanceM
      : 3000;

this.addSectorWithRadius(this.selectedPosition, radiusM);
  }

  this.cdr.detectChanges();
},
    error: (error) => this.fail(error, 'Не вдалося завантажити картку позиції'),
  });
}

closePositionPanel(): void {
  this.selectedPosition = null;
  this.selectedPositionCard = null;

  if (!this.showSectors) {
    this.sectorsLayer.clearLayers();
  }

  this.cdr.detectChanges();
}
getReadinessLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Боєготова';

    case 'not_ready':
      return 'Не боєготова';

    case 'in_progress':
      return 'Виконує ВГЗ';

    default:
      return status;
  }
}
openSettings(): void {
  void this.router.navigate(['/settings']);
}

private addSectorWithRadius(position: FirePosition, radiusM: number): void {
  if (
    position.lat === null ||
    position.lng === null ||
    position.sectorLeftDegrees === null ||
    position.sectorRightDegrees === null ||
    radiusM <= 0
  ) {
    return;
  }

  const points = this.buildSectorPoints(
    position.lat,
    position.lng,
    position.sectorLeftDegrees,
    position.sectorRightDegrees,
    radiusM,
  );

  this.L.polygon(points, {
    color: '#8b5cf6',
    weight: 1,
    fillColor: '#8b5cf6',
    fillOpacity: 0.12,
  }).addTo(this.sectorsLayer);
}

goToCreateOrder(): void {
  void this.router.navigate(['/service-orders'], {
    queryParams: {
      create: 'true',
    },
  });
}

openOrderOnMap(order: ServiceOrder): void {
  this.focusOrder(order);
}

openOrderList(): void {
  void this.router.navigate(['/service-orders']);
}

private loadActiveOrders(): void {
  this.activeOrdersRequest?.unsubscribe();

  this.activeOrdersRequest = this.serviceOrdersService.getAll().subscribe({
    next: (items) => {
      this.activeOrders = items.filter(
        (item) => item.status !== 'completed' && item.status !== 'cancelled',
      );
      this.activeFirePositionIds.clear();

      for (const order of this.activeOrders) {
        const firePositionId = order.selectedFirePositionId || order.selectedFirePosition?.id;

        if (firePositionId) {
          this.activeFirePositionIds.add(firePositionId);
        }
      }

      this.cdr.detectChanges();
    },
    error: () => {
      this.activeOrders = [];
      this.cdr.detectChanges();
    },
  });
}

private focusOrder(order: ServiceOrder): void {
  this.focusedOrderNumber = order.orderNumber;
  this.focusedOrderTarget = {
    lat: order.targetLat,
    lng: order.targetLng,
  };
  this.renderFocusedTarget(
    order.targetLat,
    order.targetLng,
    order.orderNumber,
    order.targetSettlement,
  );
}

private focusOrderFromParams(params: import('@angular/router').ParamMap): void {
  if (!params.has('lat') || !params.has('lng')) {
    return;
  }

  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  const orderNumber = params.get('orderNumber') || 'Вогневе завдання';
  this.focusedOrderNumber = orderNumber;
  this.focusedOrderTarget = { lat, lng };
  this.renderFocusedTarget(lat, lng, orderNumber, null);
}

private renderFocusedTarget(
  lat: number,
  lng: number,
  orderNumber: string,
  settlement: string | null,
): void {
  if (!this.focusLayer) {
    return;
  }

  this.focusLayer.clearLayers();

  const marker = this.L.marker([lat, lng], {
    icon: this.createTargetIcon(),
  });

  marker.bindPopup(`
    <strong>${orderNumber}</strong><br />    Ціль: ${lat}, ${lng}<br />    Район: ${settlement || '-'}
  `);

  marker.addTo(this.focusLayer);
  marker.openPopup();
  this.map.setView([lat, lng], Math.max(this.map.getZoom(), 12));
}

private loadMapResults(): void {
  this.mapResultsRequest?.unsubscribe();

  this.mapResultsRequest = this.serviceOrdersService.getMapResults().subscribe({
    next: (items) => {
      this.mapResults = items;
      this.renderMapResults();
    },
    error: () => {
      this.mapResults = [];
      this.cdr.detectChanges();
    },
  });
}

private renderMapResults(): void {
  if (!this.resultMarkersLayer) {
    return;
  }

  this.resultMarkersLayer.clearLayers();

  if (!this.showResults) {
    return;
  }

  for (const item of this.filteredMapResults) {
    const marker = this.L.marker([item.targetLat, item.targetLng], {
      icon: this.createResultIcon(),
    });

    marker.bindPopup(`
      <strong>${item.orderNumber}</strong><br />
      ${this.getResultTypeLabel(item.resultType)}<br />      Район: ${item.targetSettlement || '-'}<br />      ВП: ${item.firePositionName || '-'}<br />
      A+B: ${item.shellMarking || '-'} + ${item.chargeMarking || '-'}<br />      Зона: ${item.zoneName || '-'}<br />      Факт: ${item.actualQuantity ?? '-'}<br />
      ${item.resultComment || ''}
    `);

    marker.addTo(this.resultMarkersLayer);
  }
}

private createResultIcon(): Leaflet.DivIcon {
  return this.L.divIcon({
    className: 'result-diamond-icon',
    html: '<div></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

private createTargetIcon(): Leaflet.DivIcon {
  return this.L.divIcon({
    className: 'target-focus-icon',
    html: '<div></div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

getResultTypeLabel(type: string | null): string {
  if (type === 'mining') return 'Мінування';
  if (type === 'area_denial') return 'Закриття зони';
  if (type === 'hit') return 'Ураження';
  if (type === 'destroyed') return 'Знищено';
  if (type === 'suppression') return 'Придушення';
  if (type === 'smoke') return 'Димова завіса';
  if (type === 'fire') return 'Пожежа';
  if (type === 'illumination') return 'Освітлення';
  return '-';
}

getOrderStatusLabel(status: string): string {
  if (status === 'draft') return 'Чернетка';
  if (status === 'proposed') return 'На розгляді';
  if (status === 'sent') return 'Надіслано';
  if (status === 'accepted') return 'Прийнято';
  if (status === 'rejected') return 'Відхилено';
  if (status === 'in_progress') return 'У роботі';
  return status;
}

private get filteredMapResults(): ServiceOrderMapResult[] {
  return this.mapResults.filter((item) => {
    if (this.resultTypeFilter && item.resultType !== this.resultTypeFilter) {
      return false;
    }

    if (this.resultHistoryRange !== 'all' && item.completedAt) {
      const completedAt = new Date(item.completedAt).getTime();
      const now = Date.now();
      const windowMs = this.resultHistoryRange === 'today'
        ? this.getTodayWindowMs()
        : 7 * 24 * 60 * 60 * 1000;

      if (now - completedAt > windowMs) {
        return false;
      }
    }

    return true;
  });
}

private restoreMapFilters(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  const raw = localStorage.getItem(this.mapFilterKey);

  if (!raw) {
    return;
  }

  try {
    const filters = JSON.parse(raw) as {
      readinessFilter?: string;
      resultTypeFilter?: string;
      showResults?: boolean;
      showPositions?: boolean;
      showThreats?: boolean;
      showSectors?: boolean;
      resultHistoryRange?: 'today' | '7' | 'all';
      mapPreset?: 'ops' | 'planning' | 'logistics' | 'analysis';
    };

    this.readinessFilter = filters.readinessFilter || '';
    this.resultTypeFilter = filters.resultTypeFilter || '';
    this.showResults = filters.showResults ?? this.showResults;
    this.showPositions = filters.showPositions ?? this.showPositions;
    this.showThreats = filters.showThreats ?? this.showThreats;
    this.showSectors = filters.showSectors ?? this.showSectors;
    this.resultHistoryRange = filters.resultHistoryRange || this.resultHistoryRange;
    this.mapPreset = filters.mapPreset || this.mapPreset;
  } catch {
    localStorage.removeItem(this.mapFilterKey);
  }
}

private saveMapFilters(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(
    this.mapFilterKey,
    JSON.stringify({
      readinessFilter: this.readinessFilter,
      resultTypeFilter: this.resultTypeFilter,
      showResults: this.showResults,
      showPositions: this.showPositions,
      showThreats: this.showThreats,
      showSectors: this.showSectors,
      resultHistoryRange: this.resultHistoryRange,
      mapPreset: this.mapPreset,
    }),
  );
}

private syncLayerVisibility(): void {
  if (this.showPositions) {
    this.positionsLayer.addTo(this.map);
  } else {
    this.positionsLayer.remove();
  }

  if (this.showThreats) {
    this.threatsLayer.addTo(this.map);
  } else {
    this.threatsLayer.remove();
  }

  if (this.showResults) {
    this.resultMarkersLayer.addTo(this.map);
  } else {
    this.resultMarkersLayer.remove();
  }
}


toggleMeasureMode(): void {
  this.measureMode = !this.measureMode;
  if (!this.measureMode) {
    this.clearMeasure();
  }
}

clearMeasure(): void {
  this.measureStart = null;
  this.measureEnd = null;
  this.measureDistanceM = null;
  if (this.measureLayer) {
    this.measureLayer.clearLayers();
  }
  this.cdr.detectChanges();
}

private handleMeasureClick(lat: number, lng: number): void {
  if (!this.measureStart || this.measureEnd) {
    this.measureStart = { lat, lng };
    this.measureEnd = null;
    this.measureDistanceM = null;
    this.measureLayer.clearLayers();
    this.L.circleMarker([lat, lng], { radius: 5, weight: 2 }).addTo(this.measureLayer);
    this.cdr.detectChanges();
    return;
  }

  this.measureEnd = { lat, lng };
  this.measureDistanceM = Math.round(this.distanceBetweenMeters(this.measureStart.lat, this.measureStart.lng, lat, lng));
  this.L.circleMarker([lat, lng], { radius: 5, weight: 2 }).addTo(this.measureLayer);
  this.L.polyline([[this.measureStart.lat, this.measureStart.lng], [lat, lng]], { weight: 3, dashArray: '8 8' }).addTo(this.measureLayer);
  this.cdr.detectChanges();
}

private distanceBetweenMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusM = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


setResultHistoryRange(value: string): void {
  this.resultHistoryRange = value === '7' || value === 'all' ? value : 'today';
  this.saveMapFilters();
  this.renderMapResults();
}


private markUpdatedPositions(positions: FirePosition[]): void {
  for (const position of positions) {
    const signature = this.getPositionSignature(position);
    const previousSignature = this.previousPositionSignatures.get(position.id);

    if (previousSignature && previousSignature !== signature) {
      this.markLiveMarker(this.getPositionMarkerKey(position.id));
    }

    this.previousPositionSignatures.set(position.id, signature);
  }
}

private markUpdatedThreats(threats: AirThreat[]): void {
  for (const threat of threats) {
    const signature = this.getThreatSignature(threat);
    const previousSignature = this.previousThreatSignatures.get(threat.id);

    if (previousSignature && previousSignature !== signature) {
      this.markLiveMarker(this.getThreatMarkerKey(threat.id));
    }

    this.previousThreatSignatures.set(threat.id, signature);
  }
}

private markLiveMarker(key: string): void {
  this.liveMarkerKeys.add(key);

  const previousTimer = this.liveMarkerTimers.get(key);

  if (previousTimer) {
    clearTimeout(previousTimer);
  }

  const timer = window.setTimeout(() => {
    this.liveMarkerKeys.delete(key);
    this.liveMarkerTimers.delete(key);
    this.loadMapObjects();
  }, this.markerAnimationMs);

  this.liveMarkerTimers.set(key, timer);
}

private getPositionSignature(position: FirePosition): string {
  return [
    position.lat,
    position.lng,
    position.readinessStatus,
    position.notReadyReason || '',
    position.hasSg ? 'sg' : 'no-sg',
    position.completedVgzCount ?? 0,
  ].join('|');
}

private getThreatSignature(threat: AirThreat): string {
  return [threat.lat, threat.lng, threat.threatType, threat.isActive ? 'active' : 'inactive'].join('|');
}

private getPositionMarkerKey(id: string): string {
  return `position:${id}`;
}

private getThreatMarkerKey(id: string): string {
  return `threat:${id}`;
}

private getTodayWindowMs(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(1, Date.now() - start);
}

private updateMapZoomClass(): void {
  if (!this.map) {
    return;
  }

  const zoom = this.map.getZoom();
  const container = this.map.getContainer();

  container.classList.toggle('map-zoom-labels-full', zoom >= 13);
  container.classList.toggle('map-zoom-labels-short', zoom >= 11 && zoom < 13);
  container.classList.toggle('map-zoom-labels-hidden', zoom < 11);
}

private getFirePositionLabel(position: FirePosition): string {
  const unit = this.getFirePositionShortUnit(position);
  return [unit, position.name].filter(Boolean).join(' ');
}

private getFirePositionShortUnit(position: FirePosition): string {
  const unitName = position.unit?.name || '';
  const slash = unitName.match(/(\d+)\s*[\/\-]\s*(\d+)/);

  if (slash) {
    return `${slash[1]}/${slash[2]}`;
  }

  const numbers = unitName.match(/\d+/g) || [];

  if (numbers.length >= 2) {
    return `${numbers[0]}/${numbers[1]}`;
  }

  if (numbers.length === 1) {
    return numbers[0];
  }

  return '';
}

private escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

private formatApproxMgrs(lat: number, lng: number): string {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  const bandIndex = Math.max(0, Math.min(bands.length - 1, Math.floor((lat + 80) / 8)));
  const band = bands[bandIndex] || '-';

  return `${zone}${band} · приблизний MGRS без квадратів`;
}

}
