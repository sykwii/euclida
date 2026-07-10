import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, catchError, finalize, forkJoin, of } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { AutoRefreshService } from '../../core/auto-refresh.service';
import { submitForm } from '../../core/form-submit';
import { AirAssetsService } from '../air-assets/air-assets.service';
import { EwPositionsService } from '../ew/ew-positions.service';
import { FirePositionsService } from '../fire-positions/fire-positions.service';
import {
  PlannedRoute,
  PlannedRoutePoint,
  PlannedTripAnalyticsRow,
  PlannedTripsService,
  PlannedVehicleTrip,
} from './planned-trips.service';

type DestinationOption = {
  type: 'fire_position' | 'ew_position' | 'air_recon';
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type RouteFormState = {
  id: string;
  name: string;
  description: string;
  points: Array<{ name: string; lat: string; lng: string; isControl: boolean }>;
};

type TripSegmentForm = {
  routeId: string;
  startRoutePointId: string;
  endRoutePointId: string;
};

@Component({
  selector: 'app-planned-trips-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './planned-trips-page.html',
  styleUrl: './planned-trips-page.css',
})
export class PlannedTripsPage implements OnInit, OnDestroy {
  routes: PlannedRoute[] = [];
  trips: PlannedVehicleTrip[] = [];
  analytics: PlannedTripAnalyticsRow[] = [];
  destinationOptions: DestinationOption[] = [];
  loading = true;
  submitting = false;
  errorMessage = '';
  routeModalOpen = false;
  tripModalOpen = false;
  analyticsOpen = false;
  private readonly subscriptions = new Subscription();

  routeForm = {
    id: '',
    name: '',
    description: '',
    points: [
      { name: '', lat: '', lng: '', isControl: true },
      { name: '', lat: '', lng: '', isControl: true },
    ],
  };

  tripForm = {
    routeId: '',
    startRoutePointId: '',
    endRoutePointId: '',
    destinationKey: '',
    tripPurpose: '',
    vehicleLabel: '',
    driverLabel: '',
    plannedStartAt: '',
    segments: [] as TripSegmentForm[],
  };

  constructor(
    private readonly service: PlannedTripsService,
    private readonly firePositions: FirePositionsService,
    private readonly ewPositions: EwPositionsService,
    private readonly airAssets: AirAssetsService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

ngOnInit(): void {
  this.load();

  this.subscriptions.add(
    this.autoRefresh.watchAll(() => this.load(false)),
  );
}

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

 load(showLoader = true): void {
  this.loading = showLoader;
  this.errorMessage = '';

  forkJoin({
    routes: this.service.getRoutes().pipe(
      catchError((error) => {
        console.error('planned routes load failed', error);
        return of([] as PlannedRoute[]);
      }),
    ),
    trips: this.service.getTrips().pipe(
      catchError((error) => {
        console.error('planned trips load failed', error);
        return of([] as PlannedVehicleTrip[]);
      }),
    ),
    analytics: this.service.getAnalytics().pipe(
      catchError((error) => {
        console.error('planned trips analytics load failed', error);
        return of([] as PlannedTripAnalyticsRow[]);
      }),
    ),
    firePositions: this.firePositions.getAllForMap().pipe(
      catchError((error) => {
        console.error('fire positions load failed', error);
        return of([]);
      }),
    ),
    ewPositions: this.ewPositions.getAll().pipe(
      catchError((error) => {
        console.error('ew positions load failed', error);
        return of([]);
      }),
    ),
    airAssets: this.airAssets.getAll().pipe(
      catchError((error) => {
        console.error('air assets load failed', error);
        return of([]);
      }),
    ),
  })
    .pipe(finalize(() => (this.loading = false)))
    .subscribe({
      next: ({ routes, trips, analytics, firePositions, ewPositions, airAssets }) => {
        this.routes = routes;
        this.trips = trips;
        this.analytics = analytics;

        this.destinationOptions = [
          ...firePositions.map((item) => ({
            type: 'fire_position' as const,
            id: item.id,
            name: `ВП · ${item.name}`,
            lat: item.lat,
            lng: item.lng,
          })),
          ...ewPositions.map((item) => ({
            type: 'ew_position' as const,
            id: item.id,
            name: `РЕБ · ${item.name}`,
            lat: item.lat,
            lng: item.lng,
          })),
          ...airAssets
            .filter((item) => item.assetGroup === 'recon')
            .map((item) => ({
              type: 'air_recon' as const,
              id: item.id,
              name: `Розвідка · ${item.callsign || item.name}`,
              lat: item.lat,
              lng: item.lng,
            })),
        ];

        if (!this.tripForm.routeId && routes[0]) {
          this.tripForm.routeId = routes[0].id;
        }

        this.syncTripRoutePoints();
        this.restoreRouteDraft();
      },
      error: (error) => this.fail(error),
    });
}

  addRoutePoint(): void {
    this.routeForm.points.push({ name: '', lat: '', lng: '', isControl: false });
  }

  openRouteModal(): void {
    this.resetRouteForm();
    this.routeModalOpen = true;
  }

  closeRouteModal(): void {
    this.routeModalOpen = false;
  }

  openTripModal(): void {
    this.tripModalOpen = true;
    if (this.tripForm.segments.length === 0) {
      this.tripForm.segments = [
        {
          routeId: this.tripForm.routeId || this.routes[0]?.id || '',
          startRoutePointId: '',
          endRoutePointId: '',
        },
      ];
    }
    this.syncTripRoutePoints();
  }

  closeTripModal(): void {
    this.tripModalOpen = false;
  }

  startRouteMapDrawing(): void {
    sessionStorage.setItem('euclida_planned_route_draft', JSON.stringify({ form: this.routeForm }));
    void this.router.navigate(['/map'], { queryParams: { mode: 'planned-route', returnTo: 'planned-trips' } });
  }

  removeRoutePoint(index: number): void {
    if (this.routeForm.points.length <= 2) return;
    this.routeForm.points.splice(index, 1);
  }

  editRoute(route: PlannedRoute): void {
    this.routeForm = {
      id: route.id,
      name: route.name,
      description: route.description || '',
      points: [...route.points]
        .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
        .map((point) => ({
          name: point.name,
          lat: String(point.lat),
          lng: String(point.lng),
          isControl: point.isControl,
        })),
    };
    this.routeModalOpen = true;
  }

  resetRouteForm(): void {
    this.routeForm = {
      id: '',
      name: '',
      description: '',
      points: [
        { name: '', lat: '', lng: '', isControl: true },
        { name: '', lat: '', lng: '', isControl: true },
      ],
    };
  }

  syncTripRoutePoints(): void {
    const points = this.selectedRoutePoints;
    if (!points.length) {
      this.tripForm.startRoutePointId = '';
      this.tripForm.endRoutePointId = '';
      return;
    }

    if (!this.tripForm.startRoutePointId || !points.some((point) => point.id === this.tripForm.startRoutePointId)) {
      this.tripForm.startRoutePointId = points[0].id || '';
    }

    if (!this.tripForm.endRoutePointId || !points.some((point) => point.id === this.tripForm.endRoutePointId)) {
      this.tripForm.endRoutePointId = points[points.length - 1].id || '';
    }

    if (this.tripForm.segments.length === 1) {
      this.tripForm.segments[0].routeId = this.tripForm.routeId;
      this.tripForm.segments[0].startRoutePointId = this.tripForm.startRoutePointId;
      this.tripForm.segments[0].endRoutePointId = this.tripForm.endRoutePointId;
    }
  }

  addTripSegment(): void {
    this.tripForm.segments.push({
      routeId: this.routes[0]?.id || '',
      startRoutePointId: '',
      endRoutePointId: '',
    });
    this.syncTripSegment(this.tripForm.segments.length - 1);
  }

  removeTripSegment(index: number): void {
    if (this.tripForm.segments.length <= 1) return;
    this.tripForm.segments.splice(index, 1);
  }

  syncTripSegment(index: number): void {
    const segment = this.tripForm.segments[index];
    if (!segment) return;
    const points = this.getRoutePoints(segment.routeId);
    if (!points.length) {
      segment.startRoutePointId = '';
      segment.endRoutePointId = '';
      return;
    }
    if (!segment.startRoutePointId || !points.some((point) => point.id === segment.startRoutePointId)) {
      segment.startRoutePointId = points[0].id || '';
    }
    if (!segment.endRoutePointId || !points.some((point) => point.id === segment.endRoutePointId)) {
      segment.endRoutePointId = points[points.length - 1].id || '';
    }
  }

  getRoutePoints(routeId: string): PlannedRoutePoint[] {
    const route = this.routes.find((item) => item.id === routeId);
    return route?.points?.slice().sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)) || [];
  }

  get selectedRoutePoints(): PlannedRoutePoint[] {
    const route = this.routes.find((item) => item.id === this.tripForm.routeId);
    return route?.points?.slice().sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)) || [];
  }

  get selectedDestination(): DestinationOption | null {
    return this.destinationOptions.find((item) => this.getDestinationKey(item) === this.tripForm.destinationKey) || null;
  }

  saveRoute(): void {
    this.errorMessage = '';
    const body = {
      name: this.routeForm.name.trim(),
      description: this.routeForm.description.trim() || null,
      points: this.routeForm.points.map((point): PlannedRoutePoint => ({
        name: point.name.trim(),
        lat: Number(point.lat),
        lng: Number(point.lng),
        isControl: point.isControl,
      })),
    };

    if (!body.name || body.points.some((point) => !point.name || !Number.isFinite(point.lat) || !Number.isFinite(point.lng))) {
      this.errorMessage = 'Заповніть назву маршруту та координати всіх точок';
      return;
    }

    const request = this.routeForm.id
      ? this.service.updateRoute(this.routeForm.id, body)
      : this.service.createRoute(body);

    submitForm(request, {
      begin: () => this.beginSubmit(),
      success: () => {
        this.resetRouteForm();
        this.closeRouteModal();
        this.load();
      },
      fail: (error) => this.fail(error),
      finish: () => this.finishSubmit(),
    });
  }

  createTrip(): void {
    this.errorMessage = '';
    if (!this.tripForm.routeId || !this.tripForm.vehicleLabel.trim()) {
      this.errorMessage = 'Оберіть маршрут і вкажіть машину';
      return;
    }

    const destination = this.selectedDestination;
    submitForm(
      this.service.createTrip({
        routeId: this.tripForm.routeId,
        vehicleLabel: this.tripForm.vehicleLabel.trim(),
        driverLabel: this.tripForm.driverLabel.trim() || null,
        startRoutePointId: this.tripForm.startRoutePointId || null,
        endRoutePointId: this.tripForm.endRoutePointId || null,
        destinationEntityType: destination?.type || null,
        destinationEntityId: destination?.id || null,
        destinationName: destination?.name || null,
        destinationLat: destination?.lat ?? null,
        destinationLng: destination?.lng ?? null,
        tripPurpose: this.tripForm.tripPurpose.trim() || null,
        plannedStartAt: this.tripForm.plannedStartAt || null,
        segments: this.tripForm.segments
          .filter((segment) => segment.routeId)
          .map((segment) => ({
            routeId: segment.routeId,
            startRoutePointId: segment.startRoutePointId || null,
            endRoutePointId: segment.endRoutePointId || null,
          })),
      }),
      {
        begin: () => this.beginSubmit(),
        success: () => {
          this.tripForm.vehicleLabel = '';
          this.tripForm.driverLabel = '';
          this.tripForm.tripPurpose = '';
          this.tripForm.destinationKey = '';
          this.tripForm.segments = [];
          this.closeTripModal();
          this.load();
        },
        fail: (error) => this.fail(error),
        finish: () => this.finishSubmit(),
      },
    );
  }

  passCheckpoint(trip: PlannedVehicleTrip, checkpointId: string): void {
    this.service.passCheckpoint(trip.id, checkpointId).subscribe({
      next: () => this.load(),
      error: (error) => this.fail(error),
    });
  }

  createReturnTrip(trip: PlannedVehicleTrip): void {
    this.errorMessage = '';
    if (!trip.checkpoints || trip.checkpoints.length < 2) {
      this.errorMessage = 'Для зворотного шляху потрібно щонайменше дві точки';
      return;
    }

    submitForm(this.service.createReturnTrip(trip.id), {
      begin: () => this.beginSubmit(),
      success: () => this.load(),
      fail: (error) => this.fail(error),
      finish: () => this.finishSubmit(),
    });
  }
  archiveTrip(trip: PlannedVehicleTrip): void {
    this.service.updateTripStatus(trip.id, 'archived').subscribe({
      next: () => this.load(),
      error: (error) => this.fail(error),
    });
  }

  getTripStatusLabel(status: PlannedVehicleTrip['status']): string {
    switch (status) {
      case 'active':
        return 'в роботі';
      case 'completed':
        return 'завершено';
      case 'cancelled':
        return 'скасовано';
      case 'archived':
        return 'історія';
      default:
        return 'план';
    }
  }

  isCheckpointLate(trip: PlannedVehicleTrip, index: number): boolean {
    const checkpoint = trip.checkpoints[index];
    if (!checkpoint || checkpoint.passedAt) return false;
    const previous = index === 0 ? trip.createdAt ?? trip.plannedStartAt : trip.checkpoints[index - 1]?.passedAt;
    if (!previous) return false;
    return Date.now() - new Date(previous).getTime() > 15 * 60 * 1000;
  }

  getDestinationKey(option: DestinationOption): string {
    return `${option.type}:${option.id}`;
  }

  getSegmentAnalytics(fromName: string, toName: string): PlannedTripAnalyticsRow | null {
    return this.analytics.find((row) => row.fromName === fromName && row.toName === toName) || null;
  }

  getSegmentTitle(trip: PlannedVehicleTrip, index: number): string {
    const from = trip.checkpoints[index];
    const to = trip.checkpoints[index + 1];
    if (!from || !to) return '';
    const analytics = this.getSegmentAnalytics(from.name, to.name);
    const base = `${from.name} → ${to.name}`;
    if (!analytics) return `${base}. Даних аналітики ще немає`;
    return `${base}. Середній час: ${analytics.avgMinutes.toFixed(1)} хв, проїздів: ${analytics.samples}`;
  }

  private restoreRouteDraft(): void {
  const raw = sessionStorage.getItem('euclida_planned_route_draft');
  if (!raw) return;

  try {
    const draft = JSON.parse(raw) as {
      form?: RouteFormState;
      points?: Array<{ lat: string; lng: string }>;
    };

    if (!draft.form) return;

    const points = draft.points?.length
      ? draft.points.map((point, index) => ({
          name: draft.form?.points?.[index]?.name?.trim() || `Точка ${index + 1}`,
          lat: String(point.lat),
          lng: String(point.lng),
          isControl: draft.form?.points?.[index]?.isControl ?? true,
        }))
      : draft.form.points;

    this.routeForm = {
      ...draft.form,
      points,
    };

    this.routeModalOpen = true;
    this.errorMessage = '';

    sessionStorage.removeItem('euclida_planned_route_draft');
  } catch {
    sessionStorage.removeItem('euclida_planned_route_draft');
    this.errorMessage = 'Не вдалося відновити маршрут з карти';
  }
}

  private fail(error: any): void {
    this.errorMessage = error?.error?.message || 'Не вдалося виконати дію';
  }

  private beginSubmit(): void {
    this.errorMessage = '';
    this.submitting = true;
  }

  private finishSubmit(): void {
    this.submitting = false;
  }
}

