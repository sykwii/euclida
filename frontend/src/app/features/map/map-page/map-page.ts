import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;
type LeafletLayerGroup = import('leaflet').LayerGroup;
type LeafletLatLngExpression = import('leaflet').LatLngExpression;
type LeafletMouseEvent = import('leaflet').LeafletMouseEvent;
type LeafletDivIcon = import('leaflet').DivIcon;
type LeafletPolylineOptions = import('leaflet').PolylineOptions;
import { ActivatedRoute, Router } from '@angular/router';
import { AirThreat } from '../../air-threats/air-threat.model';
import { AirThreatsService } from '../../air-threats/air-threats.service';
import { FirePosition } from '../../fire-positions/fire-position.model';
import { FirePositionsService } from '../../fire-positions/fire-positions.service';
import { EwPosition } from '../../ew/ew-position.model';
import { EwPositionsService } from '../../ew/ew-positions.service';
import { AirAssetPosition, AirReconArea } from '../../air-assets/air-asset.model';
import { AirAssetsService } from '../../air-assets/air-assets.service';
import { FormsModule } from '@angular/forms';
import { FirePositionCard } from '../../fire-positions/fire-position-card.model';
import { ServiceOrdersService } from '../../service-orders/service-orders.service';
import { ServiceOrderMapResult } from '../../service-orders/service-order-map-result.model';
import { ServiceOrder } from '../../service-orders/service-order.model';
import { PlannedRoute, PlannedTripsService } from '../../planned-trips/planned-trips.service';
import { EventFeedService } from '../../../core/event-feed.service';
import { AuthService } from '../../auth/auth.service';
import { WeaponSystemsService } from '../../weapon-systems/weapon-systems.service';
import { WeaponSystem } from '../../weapon-systems/weapon-system.model';
import { catchError, forkJoin, of, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import ms from 'milsymbol';

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
  private scheduledRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly liveMarkerTimers = new Map<string, number>();
  private readonly mapFilterKey = 'euclida_map_filters';
  private L!: LeafletModule;
  private map!: LeafletMap;
  private tileErrorCount = 0;

  selectedPositionCard: FirePositionCard | null = null;

  mapResults: ServiceOrderMapResult[] = [];
  private resultMarkersLayer!: LeafletLayerGroup;
  private plannedRoutesLayer!: LeafletLayerGroup;
  private focusLayer!: LeafletLayerGroup;
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
  stableCursorMgrs = '-';
  cursorMgrsStable = false;
  cursorElevation = '';
  filtersPanelOpen = false;
  mapMenuVisible = false;
  errorMessage = '';
  isMapLoading = false;
  isMapRefreshing = false;
  hasMapLoaded = false;
  lastSyncLabel = '—';
  threatFormVisible = false;
  threatType = '';
  selectedThreat: AirThreat | null = null;
  selectedPosition: FirePosition | null = null;
  mapPositions: FirePosition[] = [];
  activeOrders: ServiceOrder[] = [];
  focusedOrderNumber = '';
  focusedOrderTarget: { lat: number; lng: number } | null = null;
  maintenanceStartAt = '';
  maintenanceDurationMinutes = 175;
  maintenanceExtraMinutes = 30;
  maintenanceNote = '';

  private positionsLayer!: LeafletLayerGroup;
  private threatsLayer!: LeafletLayerGroup;
  private sectorsLayer!: LeafletLayerGroup;
  private cursorStableTimer: ReturnType<typeof setTimeout> | null = null;

  showSectors = false;
  showReconAreas = false;
  showPositions = true;
  showThreats = true;
  showResults = false;
  showPlannedRoutes = false;
  plannedRouteFilter = '';
  plannedRoutes: PlannedRoute[] = [];
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
  private measureLayer!: LeafletLayerGroup;
  reconAreaMode = false;
  airTaskMode = false;
  plannedRouteMode = false;
  reconDraftPoints: { lat: number; lng: number }[] = [];
  reconAreaAssetId = '';
  private reconDraftLayer!: LeafletLayerGroup;

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly firePositionsService: FirePositionsService,
    private readonly airThreatsService: AirThreatsService,
    private readonly ewPositionsService: EwPositionsService,
    private readonly airAssetsService: AirAssetsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly serviceOrdersService: ServiceOrdersService,
    private readonly plannedTripsService: PlannedTripsService,
    private readonly eventFeed: EventFeedService,
    private readonly autoRefresh: AutoRefreshService,
    private readonly auth: AuthService,
    private readonly weaponSystemsService: WeaponSystemsService,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const leafletModule = await import('leaflet');
    this.L = ((leafletModule as unknown as { default?: LeafletModule }).default || leafletModule) as LeafletModule;
    this.restoreMapFilters();

    this.initMap();
    this.loadMapObjects();
    this.loadActiveOrders();
    this.autoRefreshSubscription.add(
      this.route.queryParamMap.subscribe((params) => {
        if (params.get('preset') === 'active') {
          this.applyLayerPreset('ops');
        }

        this.reconAreaMode = params.get('mode') === 'recon-area';
        this.airTaskMode = params.get('mode') === 'air-task';
        this.plannedRouteMode = params.get('mode') === 'planned-route';
        this.reconAreaAssetId = params.get('airAssetId') || '';
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
    this.scheduledRefreshTimer = setInterval(() => {
      this.loadMapObjects();
      this.loadActiveOrders();
    }, 60_000);
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.mapObjectsRequest?.unsubscribe();
    this.mapResultsRequest?.unsubscribe();
    this.activeOrdersRequest?.unsubscribe();
    this.positionCardRequest?.unsubscribe();
    this.liveMarkerTimers.forEach((timer) => clearTimeout(timer));
    this.liveMarkerTimers.clear();
    if (this.scheduledRefreshTimer) clearInterval(this.scheduledRefreshTimer);
    if (this.cursorStableTimer) clearTimeout(this.cursorStableTimer);
    this.map?.remove();
  }

  private initMap(): void {
    this.map = this.L.map('work-map').setView([49.0, 36.0], 8);

    this.addBaseMapLayers();

    this.positionsLayer = this.L.layerGroup().addTo(this.map);
    this.threatsLayer = this.L.layerGroup().addTo(this.map);
    this.sectorsLayer = this.L.layerGroup().addTo(this.map);
    this.resultMarkersLayer = this.L.layerGroup().addTo(this.map);
    this.plannedRoutesLayer = this.L.layerGroup().addTo(this.map);
    this.focusLayer = this.L.layerGroup().addTo(this.map);
    this.measureLayer = this.L.layerGroup().addTo(this.map);
    this.reconDraftLayer = this.L.layerGroup().addTo(this.map);
    this.updateMapZoomClass();
    this.map.on('zoomend', () => this.updateMapZoomClass());
    this.map.on('move zoom', () => this.updateCenterCoordinates());
    this.loadMapResults();
    this.updateCenterCoordinates();
    this.map.on('mousemove', (event: LeafletMouseEvent) => {
      this.cursorLat = Number(event.latlng.lat.toFixed(6));
      this.cursorLng = Number(event.latlng.lng.toFixed(6));
      this.cursorMgrs = this.formatApproxMgrs(this.cursorLat, this.cursorLng);
      this.scheduleStableMgrs();
      this.cdr.detectChanges();
    });

    this.map.on('click', (event: LeafletMouseEvent) => {
      const lat = Number(event.latlng.lat.toFixed(6));
      const lng = Number(event.latlng.lng.toFixed(6));

      if (this.measureMode) {
        this.handleMeasureClick(lat, lng);
        return;
      }

      if (this.reconAreaMode || this.airTaskMode || this.plannedRouteMode) {
        this.addReconDraftPoint(lat, lng);
        return;
      }

      this.clickedLat = lat;
      this.clickedLng = lng;
      this.mapMenuVisible = true;
      this.selectedPosition = null;
      this.cdr.detectChanges();
    });

    window.setTimeout(() => this.map.invalidateSize(), 0);
    window.setTimeout(() => this.map.invalidateSize(), 250);
  }

  private addBaseMapLayers(): void {
    const FallbackGridLayer = this.L.GridLayer.extend({
      createTile: (coords: { x: number; y: number; z: number }) => {
        const tile = document.createElement('div');
        tile.className = 'fallback-map-tile';
        tile.innerHTML = `<span>${coords.z}/${coords.x}/${coords.y}</span>`;
        return tile;
      },
    }) as unknown as new (options: { tileSize: number; opacity: number }) => import('leaflet').GridLayer;

    const fallbackGrid = new FallbackGridLayer({ tileSize: 256, opacity: 1 });

    fallbackGrid.addTo(this.map);

    const baseLayer = this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: true,
    });

    baseLayer.on('tileerror', () => {
      this.tileErrorCount += 1;

      if (this.tileErrorCount === 4) {
        this.errorMessage = 'Підкладка карти недоступна, показано резервну сітку';
        this.cdr.detectChanges();
      }
    });

    baseLayer.on('load', () => {
      this.tileErrorCount = 0;
      if (this.errorMessage === 'Підкладка карти недоступна, показано резервну сітку') {
        this.errorMessage = '';
        this.cdr.detectChanges();
      }
    });

    baseLayer.addTo(this.map);
  }

  private updateCenterCoordinates(): void {
    if (!this.map) return;
    const center = this.map.getCenter();
    this.cursorLat = Number(center.lat.toFixed(6));
    this.cursorLng = Number(center.lng.toFixed(6));
    this.cursorMgrs = this.formatApproxMgrs(this.cursorLat, this.cursorLng);
    this.scheduleStableMgrs();
    this.cdr.detectChanges();
  }

  toggleFiltersPanel(): void {
    this.filtersPanelOpen = !this.filtersPanelOpen;
    this.cdr.detectChanges();
  }

  closeFiltersPanel(): void {
    this.filtersPanelOpen = false;
    this.cdr.detectChanges();
  }

  private scheduleStableMgrs(): void {
    this.cursorMgrsStable = false;
    if (this.cursorStableTimer) clearTimeout(this.cursorStableTimer);

    this.cursorStableTimer = setTimeout(() => {
      this.stableCursorMgrs = this.cursorMgrs;
      this.cursorMgrsStable = true;
      this.cdr.detectChanges();
    }, 1000);
  }

  private loadMapObjects(): void {
    this.mapObjectsRequest?.unsubscribe();
    this.errorMessage = '';
    this.isMapLoading = !this.hasMapLoaded;
    this.isMapRefreshing = this.hasMapLoaded;
    this.cdr.detectChanges();

    this.mapObjectsRequest = forkJoin({
      positions: this.firePositionsService.getAllForMap().pipe(catchError(() => of([]))),
      ewPositions: this.ewPositionsService.getAll().pipe(catchError(() => of([]))),
      airAssets: this.airAssetsService.getAll().pipe(catchError(() => of([]))),
      threats: this.airThreatsService.getAll().pipe(catchError(() => of([]))),
      plannedRoutes: this.plannedTripsService.getRoutes().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ positions, ewPositions, airAssets, threats, plannedRoutes }) => {
        this.sectorsLayer.clearLayers();
        this.positionsLayer.clearLayers();
        this.threatsLayer.clearLayers();
        this.mapPositions = positions;
        this.plannedRoutes = plannedRoutes;
        this.renderPlannedRoutes();

        const friendlyObjects = [...positions, ...ewPositions, ...airAssets];
        this.positionsCount = friendlyObjects.length;
        this.readyCount = friendlyObjects.filter((x) => x.readinessStatus === 'ready').length;
        this.inProgressCount = positions.filter((x) => x.readinessStatus === 'in_progress').length;
        this.notReadyCount = friendlyObjects.filter((x) => x.readinessStatus === 'not_ready').length;

        this.markUpdatedPositions(positions);

        const visiblePositions = positions.filter(
          (position) => !this.readinessFilter || position.readinessStatus === this.readinessFilter,
        );
        const visibleEwPositions = ewPositions.filter(
          (position) => !this.readinessFilter || position.readinessStatus === this.readinessFilter,
        );
        const visibleAirAssets = airAssets.filter(
          (position) => !this.readinessFilter || position.readinessStatus === this.readinessFilter,
        );

        visiblePositions.forEach((position) => this.addFirePositionMarker(position));
        visibleEwPositions.forEach((position) => this.addEwPositionMarker(position));
        visibleAirAssets.forEach((position) => this.addAirAssetMarker(position));

        const activeThreats = threats.filter((threat) => threat.isActive);
        this.threatsCount = activeThreats.length;

        this.markUpdatedThreats(activeThreats);
        activeThreats.forEach((threat) => this.addThreatMarker(threat));
        this.fitMapToVisibleObjects(visiblePositions, activeThreats, visibleEwPositions, visibleAirAssets);

        this.hasMapLoaded = true;
        this.isMapLoading = false;
        this.isMapRefreshing = false;
        this.lastSyncLabel = new Date().toLocaleTimeString('uk-UA', {
          hour: '2-digit',
          minute: '2-digit',
        });
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isMapLoading = false;
        this.isMapRefreshing = false;
        this.fail(
          error,
          this.hasMapLoaded
            ? 'Карту не вдалося оновити. Показані останні доступні дані.'
            : 'Не вдалося завантажити карту',
        );
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

    marker.bindTooltip(this.getFirePositionLabel(position), {
      direction: 'top',
      offset: [0, -18],
      opacity: 0.92,
    });

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

  private addEwPositionMarker(position: EwPosition): void {
    if (position.lat === null || position.lng === null) {
      return;
    }

    const marker = this.L.marker([position.lat, position.lng], {
      icon: this.createSpecialAssetIcon('ew', position.readinessStatus, position.stationName),
    });

    marker.bindTooltip(`РЕБ ${position.callsign} · ${position.stationName}`, {
      direction: 'top',
      offset: [0, -16],
      opacity: 0.92,
    });

    marker.bindPopup(this.buildEwPopup(position));
    marker.addTo(this.positionsLayer);

    if (this.showSectors) {
      this.addEwEffectArea(position);
    }
  }

  private addAirAssetMarker(position: AirAssetPosition): void {
    if (position.lat === null || position.lng === null) {
      return;
    }

    const marker = this.L.marker([position.lat, position.lng], {
      icon: this.createSpecialAssetIcon(
        position.assetGroup === 'recon' ? 'air-recon' : 'air-combat',
        position.readinessStatus,
        position.callsign,
      ),
    });

    marker.bindTooltip(`${this.getAirAssetGroupLabel(position)} ${position.callsign}`, {
      direction: 'top',
      offset: [0, -16],
      opacity: 0.92,
    });

    marker.bindPopup(this.buildAirAssetPopup(position));
    marker.addTo(this.positionsLayer);

    if (position.assetGroup === 'recon' && this.showReconAreas) {
      this.addAirReconArea(position);
    }

    if (position.assetGroup !== 'recon' && this.showSectors) {
      this.addAirCombatSector(position);
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

    this.airThreatsService
      .create({
        threatType: this.threatType.trim(),
        lat: this.clickedLat,
        lng: this.clickedLng,
      })
      .subscribe({
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
    if (!this.selectedThreat) {
      return;
    }

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
    const radiusM =
      position.maxSectorDistanceM && position.maxSectorDistanceM > 0
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
      weight: 1,
      opacity: 0.52,

      fillColor: '#9333ea',
      fillOpacity: 0.08,
    }).addTo(this.sectorsLayer);
    this.L.polyline(points, {
      color: '#c084fc',
      weight: 1,
      opacity: 0.56,
      dashArray: '5 7',
    }).addTo(this.sectorsLayer);
  }

  private fitMapToVisibleObjects(
    positions: FirePosition[],
    threats: AirThreat[],
    ewPositions: EwPosition[] = [],
    airAssets: AirAssetPosition[] = [],
  ): void {
    if (!this.map || this.focusedOrderTarget || this.selectedPosition || this.selectedThreat) {
      return;
    }

    const points: LeafletLatLngExpression[] = [
      ...positions
        .filter((position) => position.lat !== null && position.lng !== null)
        .map(
          (position) =>
            [position.lat as number, position.lng as number] as LeafletLatLngExpression,
        ),
      ...ewPositions
        .filter((position) => position.lat !== null && position.lng !== null)
        .map((position) => [position.lat, position.lng] as LeafletLatLngExpression),
      ...airAssets
        .filter((position) => position.lat !== null && position.lng !== null)
        .map((position) => [position.lat, position.lng] as LeafletLatLngExpression),
      ...threats.map((threat) => [threat.lat, threat.lng] as LeafletLatLngExpression),
    ];

    if (points.length === 0) {
      return;
    }

    if (points.length === 1) {
      this.map.setView(points[0], Math.max(this.map.getZoom(), 11), { animate: false });
      return;
    }

    this.map.fitBounds(this.L.latLngBounds(points), {
      animate: false,
      paddingTopLeft: [360, 110],
      paddingBottomRight: [430, 120],
      maxZoom: 12,
    });
  }

  private buildSectorPoints(
    lat: number,
    lng: number,
    leftDeg: number,
    rightDeg: number,
    radiusM: number,
  ): LeafletLatLngExpression[] {
    const points: LeafletLatLngExpression[] = [[lat, lng]];
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
  ): LeafletLatLngExpression {
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

  toggleReconAreas(): void {
    this.showReconAreas = !this.showReconAreas;
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

  togglePlannedRoutes(): void {
    this.showPlannedRoutes = !this.showPlannedRoutes;
    this.saveMapFilters();
    this.syncLayerVisibility();
    this.renderPlannedRoutes();
  }

  applyLayerPreset(preset: 'ops' | 'planning' | 'logistics' | 'analysis'): void {
    this.mapPreset = preset;

    if (preset === 'ops') {
      this.showPositions = true;
      this.showThreats = true;
      this.showSectors = false;
      this.showReconAreas = false;
      this.showResults = false;
      this.showPlannedRoutes = false;
      this.readinessFilter = '';
      this.resultTypeFilter = '';
    }

    if (preset === 'planning') {
      this.showPositions = true;
      this.showThreats = true;
      this.showSectors = true;
      this.showReconAreas = true;
      this.showResults = false;
      this.showPlannedRoutes = true;
      this.readinessFilter = 'ready';
      this.resultTypeFilter = '';
    }

    if (preset === 'logistics') {
      this.showPositions = true;
      this.showThreats = false;
      this.showSectors = false;
      this.showReconAreas = false;
      this.showResults = false;
      this.showPlannedRoutes = true;
      this.readinessFilter = '';
      this.resultTypeFilter = '';
    }

    if (preset === 'analysis') {
      this.showPositions = false;
      this.showThreats = true;
      this.showSectors = false;
      this.showReconAreas = true;
      this.showResults = true;
      this.showPlannedRoutes = false;
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
    this.renderPlannedRoutes();
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

  get canMainApproveMaintenance(): boolean {
    const user = this.auth.getUser();
    return !!user && (user.role === 'admin' || (user.role === 'operator' && user.scope === 'main'));
  }

  get pendingMaintenanceRequests(): FirePosition[] {
    return this.mapPositions
      .filter((position) => position.assignedWeapon?.maintenanceStatus === 'pending')
      .sort((a, b) =>
        (a.assignedWeapon?.maintenanceRequestedStartAt || '').localeCompare(
          b.assignedWeapon?.maintenanceRequestedStartAt || '',
        ),
      );
  }

  get canOperateSelectedWeaponMaintenance(): boolean {
    const user = this.auth.getUser();
    const weapon = this.selectedPositionCard?.assignedWeapon;

    if (!user || !weapon) {
      return false;
    }

    return (
      user.role === 'operator' &&
      (user.scope === 'battery' || user.scope === 'division') &&
      (!!weapon.unit?.id ? weapon.unit.id === user.unitId || user.scope === 'division' : true)
    );
  }

  selectMaintenanceRequest(position: FirePosition): void {
    this.selectedPosition = position;
    this.loadPositionCard(position.id);
    this.selectedThreat = null;
    this.mapMenuVisible = false;
    this.threatFormVisible = false;

    if (position.lat !== null && position.lng !== null) {
      this.map.setView([position.lat, position.lng], Math.max(this.map.getZoom(), 13), {
        animate: true,
      });
    }

    this.cdr.detectChanges();
  }

  isMaintenanceOpen(status: string | null | undefined): boolean {
    return status === 'pending' || status === 'approved';
  }

  getMaintenanceStatusLabel(status: string | null | undefined): string {
    if (status === 'pending') return 'Очікує підтвердження';
    if (status === 'approved') return 'Підтверджено';
    if (status === 'completed') return 'Завершено';
    if (status === 'cancelled') return 'Скасовано';
    return 'Немає запиту';
  }

  requestSelectedWeaponMaintenance(): void {
    const weapon = this.selectedPositionCard?.assignedWeapon;

    if (!weapon) {
      return;
    }

    const requestedStartAt = this.maintenanceStartAt
      ? new Date(this.maintenanceStartAt).toISOString()
      : new Date().toISOString();

    this.weaponSystemsService
      .requestMaintenance(weapon.id, {
        requestedStartAt,
        durationMinutes: Number(this.maintenanceDurationMinutes || 0),
        note: this.maintenanceNote.trim() || undefined,
      })
      .subscribe({
        next: (updatedWeapon) =>
          this.afterMaintenanceAction('Запит ТО передано головному оператору', updatedWeapon),
        error: (error) => this.fail(error, error?.error?.message || 'Не вдалося створити запит ТО'),
      });
  }

  approveSelectedWeaponMaintenance(): void {
    this.runSelectedMaintenanceAction('approve', 'ТО підтверджено');
  }

  rejectSelectedWeaponMaintenance(): void {
    this.runSelectedMaintenanceAction('reject', 'ТО відхилено');
  }

  extendSelectedWeaponMaintenance(): void {
    const weapon = this.selectedPositionCard?.assignedWeapon;

    if (!weapon) {
      return;
    }

    this.weaponSystemsService
      .extendMaintenance(weapon.id, {
        extraMinutes: Number(this.maintenanceExtraMinutes || 0),
        note: this.maintenanceNote.trim() || undefined,
      })
      .subscribe({
        next: (updatedWeapon) => this.afterMaintenanceAction('ТО продовжено', updatedWeapon),
        error: (error) => this.fail(error, error?.error?.message || 'Не вдалося продовжити ТО'),
      });
  }

  finishSelectedWeaponMaintenance(): void {
    this.runSelectedMaintenanceAction('finish', 'ТО завершено, СГ знову БГ');
  }

  private runSelectedMaintenanceAction(
    action: 'approve' | 'reject' | 'finish',
    successTitle: string,
  ): void {
    const weapon = this.selectedPositionCard?.assignedWeapon;

    if (!weapon) {
      return;
    }

    const request =
      action === 'approve'
        ? this.weaponSystemsService.approveMaintenance(weapon.id)
        : action === 'reject'
          ? this.weaponSystemsService.rejectMaintenance(weapon.id)
          : this.weaponSystemsService.finishMaintenance(weapon.id);

    request.subscribe({
      next: (updatedWeapon) => this.afterMaintenanceAction(successTitle, updatedWeapon),
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося оновити ТО'),
    });
  }

  private afterMaintenanceAction(title: string, updatedWeapon?: WeaponSystem): void {
    this.eventFeed.add({
      type: 'info',
      title,
      details: this.selectedPosition?.name || 'ВП',
      route: '/map',
    });

    const selectedId = this.selectedPosition?.id;
    if (updatedWeapon) {
      this.patchSelectedMaintenanceWeapon(updatedWeapon);
    }
    this.resetMaintenanceForm();

    if (selectedId) {
      this.loadPositionCard(selectedId);
    }

    this.loadMapObjects();
  }

  private patchSelectedMaintenanceWeapon(updatedWeapon: WeaponSystem): void {
    if (this.selectedPositionCard?.assignedWeapon?.id === updatedWeapon.id) {
      this.selectedPositionCard = {
        ...this.selectedPositionCard,
        assignedWeapon: {
          ...this.selectedPositionCard.assignedWeapon,
          readinessStatus: updatedWeapon.readinessStatus,
          notReadyReason: updatedWeapon.notReadyReason,
          maintenanceStatus: updatedWeapon.maintenanceStatus,
          maintenanceRequestedStartAt: updatedWeapon.maintenanceRequestedStartAt,
          maintenancePlannedEndAt: updatedWeapon.maintenancePlannedEndAt,
          maintenanceActualEndAt: updatedWeapon.maintenanceActualEndAt,
          maintenanceNote: updatedWeapon.maintenanceNote,
        },
      };
    }

    if (this.selectedPosition?.assignedWeapon?.id === updatedWeapon.id) {
      this.selectedPosition = {
        ...this.selectedPosition,
        assignedWeapon: {
          ...this.selectedPosition.assignedWeapon,
          readinessStatus: updatedWeapon.readinessStatus,
          notReadyReason: updatedWeapon.notReadyReason,
          maintenanceStatus: updatedWeapon.maintenanceStatus,
          maintenanceRequestedStartAt: updatedWeapon.maintenanceRequestedStartAt,
          maintenancePlannedEndAt: updatedWeapon.maintenancePlannedEndAt,
          maintenanceActualEndAt: updatedWeapon.maintenanceActualEndAt,
          maintenanceNote: updatedWeapon.maintenanceNote,
        },
      };
    }

    this.cdr.detectChanges();
  }

  private resetMaintenanceForm(): void {
    this.maintenanceStartAt = '';
    this.maintenanceDurationMinutes = 175;
    this.maintenanceExtraMinutes = 30;
    this.maintenanceNote = '';
  }
  private createPositionIcon(position: FirePosition): LeafletDivIcon {
    const color = this.getReadinessColor(position.readinessStatus);
    const label = this.escapeHtml(this.getFirePositionLabel(position));
    const shortLabel = this.escapeHtml(this.getFirePositionShortUnit(position));
    const classes = [
      'position-marker-wrap',
      `type-${this.getPositionTypeClass(position)}`,
      this.isPositionMaintenancePending(position) ? 'has-maintenance-pending' : '',
      this.isPositionMaintenanceActive(position) ? 'has-maintenance-active' : '',
      this.liveMarkerKeys.has(this.getPositionMarkerKey(position.id)) ? 'is-live-update' : '',
      this.activeFirePositionIds.has(position.id) || position.readinessStatus === 'in_progress'
        ? 'is-active-task'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    return this.L.divIcon({
      className: 'custom-position-marker nato-app6-position-marker',
      html: `
      <div class="${classes}">
        <div class="tactical-sign" style="--marker-color: ${color}">
          ${this.getPositionSignGlyph(position)}
        </div>
        <div class="position-map-label">
          <span class="position-label-full">${label}</span>
          <span class="position-label-short">${shortLabel}</span>
        </div>
      </div>
    `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }

  private createSpecialAssetIcon(
    kind: 'ew' | 'air-recon' | 'air-combat',
    readinessStatus: string,
    label: string,
  ): LeafletDivIcon {
    const color = this.getReadinessColor(readinessStatus);
    const glyph = kind === 'ew' ? 'EW' : kind === 'air-recon' ? 'AIR' : 'FPV';
    const safeLabel = this.escapeHtml(label || '-');
    const typeClass =
      kind === 'ew' ? 'type-ew-station' : kind === 'air-recon' ? 'type-aerial-recon' : 'type-air-asset';

    return this.L.divIcon({
      className: 'custom-special-asset-marker',
      html: `
        <div class="position-marker-wrap special-asset-wrap ${typeClass} type-${kind}" style="--marker-color: ${color}">
          <div class="tactical-sign special-asset-sign">
            <span class="special-asset-glyph">${glyph}</span>
          </div>
          <div class="position-map-label special-asset-label">
            <span class="position-label-full">${safeLabel}</span>
            <span class="position-label-short">${safeLabel.slice(0, 8)}</span>
          </div>
        </div>
      `,
      iconSize: [46, 46],
      iconAnchor: [23, 23],
    });
  }



  private buildEwPopup(position: EwPosition): string {
    const ranges = (position.frequencyRanges || [])
      .map((range) => {
        const label = range.label ? `${this.escapeHtml(range.label)}: ` : '';
        return `${label}${range.frequencyFromMhz}-${range.frequencyToMhz} МГц`;
      })
      .join('<br />');

    return `
      <strong>РЕБ ${this.escapeHtml(position.callsign)}</strong><br />
      Позиція: ${this.escapeHtml(position.name)}<br />
      Станція: ${this.escapeHtml(position.stationName)}<br />
      Статус: ${this.getReadinessLabel(position.readinessStatus)}<br />
      Частоти:<br />${ranges || '-'}<br />
      Ротація: ${position.personnelRotationDate || '-'}
    `;
  }


  private buildAirAssetPopup(position: AirAssetPosition): string {
    const typeLabel = position.assetGroup === 'recon'
      ? this.getAirReconTypeLabel(position.reconType || '')
      : this.getAirCombatTypeLabel(position.combatType || '');

    return `
      <strong>${this.escapeHtml(this.getAirAssetGroupLabel(position))} ${this.escapeHtml(position.callsign)}</strong><br />
      Позиція: ${this.escapeHtml(position.name)}<br />
      Тип: ${this.escapeHtml(typeLabel)}<br />
      Засіб/модель: ${this.escapeHtml(position.assetName || position.droneModel || '-')}<br />
      Склад: див. вкладку повітряних засобів<br />
      Статус: ${this.getReadinessLabel(position.readinessStatus)}<br />
      Ротація: ${position.personnelRotationDate || '-'}
    `;
  }

  private addEwEffectArea(position: EwPosition): void {
    if (position.effectMode === 'radius' && position.radiusM && position.radiusM > 0) {
      this.L.circle([position.lat, position.lng], {
        radius: position.radiusM,
        color: '#22d3ee',
        weight: 1,
        opacity: 0.42,
        fillColor: '#22d3ee',
        fillOpacity: 0.055,
        dashArray: '6 8',
      }).addTo(this.sectorsLayer);
      return;
    }

    if (
      position.effectMode === 'sector' &&
      position.sectorLeftDegrees !== null &&
      position.sectorLeftDegrees !== undefined &&
      position.sectorRightDegrees !== null &&
      position.sectorRightDegrees !== undefined
    ) {
      const points = this.buildSectorPoints(
        position.lat,
        position.lng,
        position.sectorLeftDegrees,
        position.sectorRightDegrees,
        position.radiusM && position.radiusM > 0 ? position.radiusM : 3000,
      );

      this.L.polygon(points, {
        color: '#22d3ee',
        weight: 1,
        opacity: 0.48,
        fillColor: '#22d3ee',
        fillOpacity: 0.06,
        dashArray: '6 8',
      }).addTo(this.sectorsLayer);
    }
  }



  private addAirReconArea(position: AirAssetPosition): void {
    const areas = position.reconAreas || [];

    areas.forEach((area) => {
      if (!area.points || area.points.length < 3) {
        return;
      }

      const points = area.points
        .slice()
        .sort((a, b) => (a.pointOrder ?? 0) - (b.pointOrder ?? 0))
        .map((point) => [point.lat, point.lng] as LeafletLatLngExpression);
      const style = this.getReconAreaStyle(area.status);
      const polygon = this.L.polygon(points, style).addTo(this.sectorsLayer);

      polygon.bindTooltip(
        `${this.escapeHtml(area.name || 'Район розвідки')} - ${this.escapeHtml(position.callsign)} - ${this.getReconAreaStatusLabel(area.status)}`,
        { sticky: true, opacity: 0.92 },
      );

      polygon.bindPopup(`
        <strong>${this.escapeHtml(area.name || 'Район розвідки')}</strong><br />
        Розрахунок: ${this.escapeHtml(position.callsign)}<br />
        Тип: ${this.escapeHtml(this.getAirReconTypeLabel(position.reconType || ''))}<br />
        Статус: ${this.getReconAreaStatusLabel(area.status)}<br />
        План: ${this.escapeHtml(area.plannedStartAt || area.activeDate || '-')} → ${this.escapeHtml(area.plannedEndAt || '-')}<br />
        Точки: ${area.points.length}
      `);
    });
  }

  private addAirCombatSector(position: AirAssetPosition): void {
    if (
      position.sectorLeftDegrees === null ||
      position.sectorLeftDegrees === undefined ||
      position.sectorRightDegrees === null ||
      position.sectorRightDegrees === undefined
    ) {
      return;
    }

    const points = this.buildSectorPoints(
      position.lat,
      position.lng,
      position.sectorLeftDegrees,
      position.sectorRightDegrees,
      position.maxSectorDistanceM && position.maxSectorDistanceM > 0 ? position.maxSectorDistanceM : 5000,
    );

    this.L.polygon(points, {
      color: '#fb7185',
      weight: 1,
      opacity: 0.5,
      fillColor: '#fb7185',
      fillOpacity: 0.06,
      dashArray: '5 7',
    }).addTo(this.sectorsLayer);
  }

  private getLatestReconArea(position: AirAssetPosition): AirReconArea | null {
    const areas = position.reconAreas || [];

    if (areas.length === 0) {
      return null;
    }

    return [...areas].sort((a, b) => b.activeDate.localeCompare(a.activeDate))[0];
  }


  private getReconAreaStyle(status?: string): LeafletPolylineOptions {
    if (status === 'active') {
      return { color: '#2ee6d6', weight: 2, opacity: 0.72, fillColor: '#14b8a6', fillOpacity: 0.09 };
    }

    if (status === 'completed') {
      return { color: '#94a3b8', weight: 1, opacity: 0.42, fillColor: '#64748b', fillOpacity: 0.04, dashArray: '5 7' };
    }

    if (status === 'cancelled') {
      return { color: '#f87171', weight: 1, opacity: 0.38, fillColor: '#7f1d1d', fillOpacity: 0.04, dashArray: '3 8' };
    }

    return { color: '#38bdf8', weight: 1, opacity: 0.56, fillColor: '#0ea5e9', fillOpacity: 0.055, dashArray: '7 8' };
  }



  private getReconAreaStatusLabel(status?: string): string {
    if (status === 'active') return 'Активний';
    if (status === 'completed') return 'Завершений';
    if (status === 'cancelled') return 'Скасований';
    return 'План';
  }


  private getAirAssetGroupLabel(position: AirAssetPosition): string {
    return position.assetGroup === 'recon' ? 'Розвідка' : 'Ударний розрахунок';
  }


  private getAirReconTypeLabel(type: string): string {
    if (type === 'copter') return 'Коптер';
    if (type === 'fixed_wing') return 'БпЛА крило';
    return '-';
  }


  private getAirCombatTypeLabel(type: string): string {
    if (type === 'fpv_radio') return 'FPV радіокерування';
    if (type === 'fpv_fiber') return 'FPV оптоволокно';
    if (type === 'kamikaze') return 'Камікадзе';
    if (type === 'heavy_bomber') return 'Важкий бомбер';
    return '-';
  }

  private createThreatIcon(threat?: AirThreat): LeafletDivIcon {
    const threatClass = threat ? this.getThreatTypeClass(threat.threatType) : 'unknown';
    const classes = [
      'threat-marker',
      `type-${threatClass}`,
      threat && this.liveMarkerKeys.has(this.getThreatMarkerKey(threat.id)) ? 'is-live-update' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return this.L.divIcon({
      className: 'custom-threat-marker',
      html: `
      <div class="${classes}">
        ${this.getThreatSignGlyph(threat?.threatType)}
      </div>
    `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }

  private getPositionTypeClass(position: FirePosition): string {
    const type = position.positionType || 'fire_position';

    if (type === 'ew_post') return 'ew-post';
    if (type === 'ew_station') return 'ew-station';
    if (type === 'aerial_recon') return 'aerial-recon';
    if (type === 'air_asset_crew') return 'air-asset';

    return 'fire-position';
  }

  private getPositionSignGlyph(position: FirePosition): string {
  const color = this.getReadinessColor(position.readinessStatus);
  const symbol = this.getPositionMilsymbolSvg(position, color);

  if (this.isPositionMaintenanceActive(position)) {
    return '<span class="maintenance-map-glyph active">&#128295;</span>';
  }

  if (this.isPositionMaintenancePending(position)) {
    return `
      <span class="maintenance-pending-stack">
        <span class="maintenance-normal-sign">${symbol}</span>
        <span class="maintenance-map-glyph pending">&#128295;</span>
      </span>
    `;
  }

  return symbol;
}

private getPositionMilsymbolSvg(position: FirePosition, color: string): string {
  return new ms.Symbol(this.getPositionSidc(position), {
    size: 40,
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
    .replace(/fill="rgb\(128,224,255\)"/g, 'fill="rgba(128,224,255,0.10)"')
    .replace(/fill="#80E0FF"/gi, 'fill="rgba(128,224,255,0.10)"')
    .replace(/fill="black"/gi, `fill="${color}"`)
    .replace(/stroke="black"/gi, `stroke="${color}"`)
    .replace(/stroke="#000000"/gi, `stroke="${color}"`)
    .replace(/fill="#000000"/gi, `fill="${color}"`);
}

  private isPositionMaintenancePending(position: FirePosition): boolean {
    return position.assignedWeapon?.maintenanceStatus === 'pending';
  }

  private isPositionMaintenanceActive(position: FirePosition): boolean {
    const weapon = position.assignedWeapon;

    if (!weapon || weapon.maintenanceStatus !== 'approved') {
      return false;
    }

    const now = Date.now();
    const start = weapon.maintenanceRequestedStartAt
      ? new Date(weapon.maintenanceRequestedStartAt).getTime()
      : 0;
    const end = weapon.maintenancePlannedEndAt
      ? new Date(weapon.maintenancePlannedEndAt).getTime()
      : 0;

    return start <= now && now < end;
  }

  private getThreatTypeClass(value: string): string {
    const normalized = value.toLowerCase();

    if (normalized.includes('бп') || normalized.includes('uav') || normalized.includes('дрон')) {
      return 'uav';
    }

    if (normalized.includes('рак') || normalized.includes('missile')) {
      return 'missile';
    }

    if (normalized.includes('аві') || normalized.includes('air') || normalized.includes('літак')) {
      return 'aircraft';
    }

    return 'unknown';
  }

  private getThreatSignGlyph(value?: string): string {
    const type = this.getThreatTypeClass(value || '');

    if (type === 'uav') return '<span>в—‡</span>';
    if (type === 'missile') return '<span>вћ¤</span>';
    if (type === 'aircraft') return '<span>в–і</span>';

    return '<span>!</span>';
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
              : this.selectedPosition.maxSectorDistanceM &&
                  this.selectedPosition.maxSectorDistanceM > 0
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
      opacity: 0.48,
      fillColor: '#8b5cf6',
      fillOpacity: 0.08,
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

  private renderPlannedRoutes(): void {
    if (!this.plannedRoutesLayer) return;
    this.plannedRoutesLayer.clearLayers();
    if (!this.showPlannedRoutes) return;

    const routes = this.plannedRoutes.filter((route) => !this.plannedRouteFilter || route.id === this.plannedRouteFilter);

    routes.forEach((route, routeIndex) => {
      const points = (route.points || [])
        .slice()
        .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
        .filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)))
        .map((point) => [Number(point.lat), Number(point.lng)] as LeafletLatLngExpression);

      if (points.length < 2) return;

      const color = this.getPlannedRouteColor(routeIndex);
      this.L.polyline(points, {
        color,
        weight: 4,
        opacity: 0.82,
        dashArray: '10 8',
      })
        .bindTooltip(route.name, { sticky: true, opacity: 0.92 })
        .addTo(this.plannedRoutesLayer);

      points.forEach((point, index) => {
        this.L.circleMarker(point, {
          radius: index === 0 || index === points.length - 1 ? 5 : 4,
          color,
          weight: 2,
          fillColor: '#02080d',
          fillOpacity: 0.92,
        })
          .bindTooltip(`${route.name}: ${index + 1}`, { direction: 'top', opacity: 0.88 })
          .addTo(this.plannedRoutesLayer);
      });
    });
  }

  private getPlannedRouteColor(index: number): string {
    const colors = ['#2ee6d6', '#f2b724', '#4fa3ff', '#a78bfa', '#31f58b', '#fb7185'];
    return colors[index % colors.length];
  }

  private createResultIcon(): LeafletDivIcon {
    return this.L.divIcon({
      className: 'result-diamond-icon',
      html: '<div></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  private createTargetIcon(): LeafletDivIcon {
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
        const windowMs =
          this.resultHistoryRange === 'today' ? this.getTodayWindowMs() : 7 * 24 * 60 * 60 * 1000;

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
        showReconAreas?: boolean;
        showPlannedRoutes?: boolean;
        plannedRouteFilter?: string;
        resultHistoryRange?: 'today' | '7' | 'all';
        mapPreset?: 'ops' | 'planning' | 'logistics' | 'analysis';
      };

      this.readinessFilter = filters.readinessFilter || '';
      this.resultTypeFilter = filters.resultTypeFilter || '';
      this.showResults = filters.showResults ?? this.showResults;
      this.showPositions = filters.showPositions ?? this.showPositions;
      this.showThreats = filters.showThreats ?? this.showThreats;
      this.showSectors = filters.showSectors ?? this.showSectors;
      this.showReconAreas = filters.showReconAreas ?? this.showReconAreas;
      this.showPlannedRoutes = filters.showPlannedRoutes ?? this.showPlannedRoutes;
      this.plannedRouteFilter = filters.plannedRouteFilter || '';
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
        showReconAreas: this.showReconAreas,
        showPlannedRoutes: this.showPlannedRoutes,
        plannedRouteFilter: this.plannedRouteFilter,
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

    if (this.showPlannedRoutes) {
      this.plannedRoutesLayer.addTo(this.map);
    } else {
      this.plannedRoutesLayer.remove();
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
    this.measureDistanceM = Math.round(
      this.distanceBetweenMeters(this.measureStart.lat, this.measureStart.lng, lat, lng),
    );
    this.L.circleMarker([lat, lng], { radius: 5, weight: 2 }).addTo(this.measureLayer);
    this.L.polyline(
      [
        [this.measureStart.lat, this.measureStart.lng],
        [lat, lng],
      ],
      { weight: 3, dashArray: '8 8' },
    ).addTo(this.measureLayer);
    this.cdr.detectChanges();
  }

  addReconDraftPoint(lat: number, lng: number): void {
    this.reconDraftPoints = [...this.reconDraftPoints, { lat, lng }];
    this.renderReconDraft();
  }

  clearReconDraft(): void {
    this.reconDraftPoints = [];
    this.reconDraftLayer?.clearLayers();
    this.cdr.detectChanges();
  }

  removeLastReconDraftPoint(): void {
    this.reconDraftPoints = this.reconDraftPoints.slice(0, -1);
    this.renderReconDraft();
  }

  cancelReconDraft(): void {
    this.clearReconDraft();
    void this.router.navigate([this.plannedRouteMode ? '/planned-trips' : '/air-assets']);
  }

  finishReconDraft(): void {
    if (this.reconDraftPoints.length < (this.plannedRouteMode ? 2 : 3)) return;

    const storageKey = this.plannedRouteMode
      ? 'euclida_planned_route_draft'
      : this.airTaskMode
        ? 'euclida_air_task_draft'
        : 'euclida_recon_area_draft';
    const raw = sessionStorage.getItem(storageKey);
    const draft = raw ? JSON.parse(raw) : {};
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        ...draft,
        airAssetId: this.reconAreaAssetId || draft.airAssetId,
        points: this.reconDraftPoints.map((point) => ({
          lat: String(point.lat),
          lng: String(point.lng),
        })),
      }),
    );

    void this.router.navigate([this.plannedRouteMode ? '/planned-trips' : '/air-assets'], {
      queryParams: this.plannedRouteMode
        ? { restoreRoute: 'true' }
        : this.airTaskMode
          ? { restoreAirTask: 'true' }
          : { restoreReconArea: 'true' },
    });
  }

  private renderReconDraft(): void {
    this.reconDraftLayer.clearLayers();
    const points = this.reconDraftPoints.map((point) => [point.lat, point.lng] as LeafletLatLngExpression);

    points.forEach((point, index) => {
      this.L.circleMarker(point, {
        radius: 5,
        color: '#2ee6d6',
        weight: 2,
        fillColor: '#2ee6d6',
        fillOpacity: 0.45,
      })
        .bindTooltip(`#${index + 1}`, { permanent: true, direction: 'top', opacity: 0.8 })
        .addTo(this.reconDraftLayer);
    });

    if (points.length >= 2) {
      this.L.polyline(points, { color: '#2ee6d6', weight: 2, dashArray: '6 8' }).addTo(this.reconDraftLayer);
    }

    if (points.length >= 3) {
      this.L.polygon(points, {
        color: '#2ee6d6',
        weight: 2,
        opacity: 0.72,
        fillColor: '#14b8a6',
        fillOpacity: 0.08,
      }).addTo(this.reconDraftLayer);
    }

    this.cdr.detectChanges();
  }

  private distanceBetweenMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const earthRadiusM = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
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
    return [
      threat.lat,
      threat.lng,
      threat.threatType,
      threat.isActive ? 'active' : 'inactive',
    ].join('|');
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

private getPositionSidc(position: FirePosition): string {
  return this.toMilsymbolSidc(this.getFirePositionArtillerySidc(position));
}

private getFirePositionArtillerySidc(position: FirePosition): string {
  const weapon = position.assignedWeapon;
  const modelName = weapon?.weaponModel?.name?.toLowerCase() || '';
  const systemType = weapon?.weaponModel?.systemType?.toLowerCase() || '';

  if (!weapon || !position.hasSg) {
    return 'SFGPUCFHE-*****';
  }

  if (
    systemType.includes('reactive') ||
    systemType.includes('rocket') ||
    systemType.includes('mlrs') ||
    modelName.includes('рсзв') ||
    modelName.includes('град') ||
    modelName.includes('ураган') ||
    modelName.includes('смерч') ||
    modelName.includes('himars')
  ) {
    return 'SFGPUCFRMS*****';
  }

  if (
    modelName.includes('міномет') ||
    modelName.includes('миномет') ||
    modelName.includes('mortar')
  ) {
    return 'SFGPUCFM--*****';
  }

  if (
    modelName.includes('сау') ||
    modelName.includes('2с') ||
    modelName.includes('2s') ||
    modelName.includes('m109') ||
    modelName.includes('krab') ||
    modelName.includes('caesar') ||
    modelName.includes('богдана') ||
    modelName.includes('pzh') ||
    modelName.includes('archer')
  ) {
    return 'SFGPUCFHE-*****';
  }

  return 'SFGPUCFH--*****';
}

private toMilsymbolSidc(sidc: string): string {
  return sidc.replace(/\*/g, '-');
}
}

