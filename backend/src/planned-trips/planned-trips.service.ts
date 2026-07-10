import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { PlannedRoutePoint } from './planned-route-point.entity';
import { PlannedRoute } from './planned-route.entity';
import { PlannedVehicleTripCheckpoint } from './planned-vehicle-trip-checkpoint.entity';
import { PlannedVehicleTrip } from './planned-vehicle-trip.entity';

interface RoutePointInput {
  name: string;
  lat: number;
  lng: number;
  isControl?: boolean;
}

interface RouteInput {
  name: string;
  description?: string | null;
  points: RoutePointInput[];
}

interface TripInput {
  routeId: string;
  vehicleLabel: string;
  driverLabel?: string | null;
  startRoutePointId?: string | null;
  endRoutePointId?: string | null;
  destinationEntityType?: 'fire_position' | 'ew_position' | 'air_recon' | null;
  destinationEntityId?: string | null;
  destinationName?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  tripPurpose?: string | null;
  plannedStartAt?: string | null;
  segments?: Array<{
    routeId: string;
    startRoutePointId?: string | null;
    endRoutePointId?: string | null;
  }>;
}

@Injectable()
export class PlannedTripsService {
  constructor(
    @InjectRepository(PlannedRoute)
    private readonly routes: Repository<PlannedRoute>,
    @InjectRepository(PlannedRoutePoint)
    private readonly routePoints: Repository<PlannedRoutePoint>,
    @InjectRepository(PlannedVehicleTrip)
    private readonly trips: Repository<PlannedVehicleTrip>,
    @InjectRepository(PlannedVehicleTripCheckpoint)
    private readonly checkpoints: Repository<PlannedVehicleTripCheckpoint>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly accessScope: AccessScopeService,
    private readonly realtime: RealtimeEventsService,
  ) {
    void this.ensureSchema();
  }

  findRoutes() {
    return this.routes.find({ relations: { points: true }, order: { createdAt: 'DESC', points: { sortOrder: 'ASC' } } });
  }

async createRoute(input: RouteInput) {
  const points = this.normalizePoints(input.points);
  const route = this.routes.create({
    name: input.name.trim(),
    description: input.description?.trim() || null,
    points: points.map((point, index) =>
      this.routePoints.create({ ...point, sortOrder: index }),
    ),
  });

  const saved = await this.routes.save(route);
  this.emitLogistics('created', saved.id);

  return saved;
}

  async updateRoute(id: string, input: RouteInput) {
  const route = await this.routes.findOne({ where: { id }, relations: { points: true } });
  if (!route) throw new NotFoundException('Route not found');

  await this.routePoints.delete({ routeId: id });
  route.name = input.name.trim();
  route.description = input.description?.trim() || null;
  route.points = this.normalizePoints(input.points).map((point, index) =>
    this.routePoints.create({ ...point, routeId: id, sortOrder: index }),
  );

  const saved = await this.routes.save(route);
  this.emitLogistics('updated', saved.id);

  return saved;
}

async deleteRoute(id: string) {
  const activeTrips = await this.trips.count({ where: { routeId: id, status: 'active' } });
  if (activeTrips > 0) throw new BadRequestException('Route has active trips');

  await this.routes.delete(id);
  this.emitLogistics('updated', id);
}

  async findTrips(user: AuthUser) {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) return [];

    return this.trips.find({
      relations: { route: true, checkpoints: true },
      where:
        allowedUnitIds === null
          ? [{ status: 'planned' }, { status: 'active' }, { status: 'completed' }, { status: 'cancelled' }]
          : [
              { status: 'planned', unitId: In(allowedUnitIds) },
              { status: 'active', unitId: In(allowedUnitIds) },
              { status: 'completed', unitId: In(allowedUnitIds) },
              { status: 'cancelled', unitId: In(allowedUnitIds) },
            ],
      order: { createdAt: 'DESC', checkpoints: { sortOrder: 'ASC' } },
    });
  }

  async createTrip(input: TripInput, user: AuthUser) {
    const route = await this.routes.findOne({ where: { id: input.routeId }, relations: { points: true } });
    if (!route) throw new NotFoundException('Route not found');
    if (!route.points?.length) throw new BadRequestException('Route has no points');
    if (!this.accessScope.canWrite(user)) throw new ForbiddenException('Немає прав змінювати поїздки');
    const selectedRoutePoints = await this.buildTripRoutePoints(input, route);
    const destination = this.normalizeDestination(input);

    const trip = this.trips.create({
      routeId: input.segments?.[0]?.routeId || route.id,
      unitId: user.unitId ?? null,
      vehicleLabel: input.vehicleLabel.trim(),
      driverLabel: input.driverLabel?.trim() || null,
      startRoutePointId: selectedRoutePoints[0]?.id ?? null,
      endRoutePointId: selectedRoutePoints[selectedRoutePoints.length - 1]?.id ?? null,
      destinationEntityType: destination.type,
      destinationEntityId: destination.id,
      destinationName: destination.name,
      tripPurpose: input.tripPurpose?.trim() || null,
      plannedStartAt: input.plannedStartAt ? new Date(input.plannedStartAt) : null,
      status: 'active',
      checkpoints: [
        ...selectedRoutePoints
        .map((point, index) =>
          this.checkpoints.create({
            routePointId: point.id,
            name: point.name,
            lat: point.lat,
            lng: point.lng,
            isControl: point.isControl,
            sortOrder: index,
            passedAt: null,
          }),
        ),
        ...(destination.name && destination.lat !== null && destination.lng !== null
          ? [
              this.checkpoints.create({
                routePointId: null,
                name: destination.name,
                lat: destination.lat,
                lng: destination.lng,
                isControl: true,
                sortOrder: selectedRoutePoints.length,
                passedAt: null,
              }),
            ]
          : []),
      ],
    });
    const saved = await this.trips.save(trip);
    this.emitLogistics('created', saved.id, saved.unitId ?? undefined);
    return saved;
  }

  async markCheckpointPassed(tripId: string, checkpointId: string, user: AuthUser) {
  const trip = await this.findTripForMutation(tripId, user);

  if (trip.status === 'archived') {
    throw new BadRequestException('Поїздка вже в історії');
  }

  const checkpoint = await this.checkpoints.findOne({
    where: { id: checkpointId, tripId },
  });

  if (!checkpoint) {
    throw new NotFoundException('Checkpoint not found');
  }

  checkpoint.passedAt = new Date();
  await this.checkpoints.save(checkpoint);

  const checkpoints = await this.checkpoints.find({
    where: { tripId },
    order: { sortOrder: 'ASC' },
  });

  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  const isLastCheckpointPassed = lastCheckpoint?.id === checkpoint.id;

  if (isLastCheckpointPassed) {
    await this.trips.update(tripId, { status: 'completed' });
  }

  const saved = await this.trips.findOneOrFail({
    where: { id: tripId },
    relations: { route: true, checkpoints: true },
  });

  this.emitLogistics(isLastCheckpointPassed ? 'completed' : 'updated', saved.id, saved.unitId ?? undefined);

  return saved;
}

  async updateTrip(id: string, input: { status?: string }, user: AuthUser) {
    const trip = await this.findTripForMutation(id, user);

    if (input.status && !['planned', 'active', 'completed', 'cancelled', 'archived'].includes(input.status)) {
      throw new BadRequestException('Некоректний статус поїздки');
    }

    if (input.status) {
      trip.status = input.status as PlannedVehicleTrip['status'];
    }

    const saved = await this.trips.save(trip);
    this.emitLogistics(input.status === 'archived' ? 'completed' : 'updated', saved.id, saved.unitId ?? undefined);
    return saved;
  }

  async createReturnTrip(id: string, user: AuthUser) {
    const trip = await this.findTripForMutation(id, user);
    if (!trip.checkpoints?.length || trip.checkpoints.length < 2) {
      throw new BadRequestException('Для зворотного шляху потрібно щонайменше дві точки');
    }

    const checkpoints = [...trip.checkpoints].sort((a, b) => a.sortOrder - b.sortOrder);
    await this.trips.update(id, { status: 'archived' });
    this.emitLogistics('completed', id, trip.unitId ?? undefined);

    const returnTrip = this.trips.create({
      routeId: trip.routeId,
      unitId: trip.unitId,
      vehicleLabel: trip.vehicleLabel,
      driverLabel: trip.driverLabel,
      startRoutePointId: trip.endRoutePointId,
      endRoutePointId: trip.startRoutePointId,
      destinationEntityType: null,
      destinationEntityId: null,
      destinationName: checkpoints[0]?.name ? `Фініш: ${checkpoints[0].name}` : null,
      tripPurpose: trip.tripPurpose ? `Зворотно: ${trip.tripPurpose}` : 'Зворотний шлях',
      plannedStartAt: new Date(),
      status: 'active',
      checkpoints: checkpoints
        .slice()
        .reverse()
        .map((point, index) =>
          this.checkpoints.create({
            routePointId: point.routePointId,
            name: point.name,
            lat: point.lat,
            lng: point.lng,
            isControl: point.isControl,
            sortOrder: index,
            passedAt: null,
          }),
        ),
    });

    const saved = await this.trips.save(returnTrip);
    this.emitLogistics('created', saved.id, saved.unitId ?? undefined);
    return saved;
  }

  async analytics(user: AuthUser) {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) return [];
    const unitFilter = allowedUnitIds === null ? '' : 'AND t.unit_id = ANY($1)';
    const params = allowedUnitIds === null ? [] : [allowedUnitIds];
    const rows = await this.dataSource.query(`
      SELECT
        c1.name AS from_name,
        c2.name AS to_name,
        AVG(EXTRACT(EPOCH FROM (c2.passed_at - c1.passed_at)) / 60)::numeric(12,2) AS avg_minutes,
        COUNT(*)::int AS samples
      FROM planned_vehicle_trip_checkpoints c1
      JOIN planned_vehicle_trip_checkpoints c2
        ON c2.trip_id = c1.trip_id AND c2.sort_order = c1.sort_order + 1
      JOIN planned_vehicle_trips t ON t.id = c1.trip_id
      WHERE c1.passed_at IS NOT NULL AND c2.passed_at IS NOT NULL
        ${unitFilter}
      GROUP BY c1.name, c2.name
      ORDER BY c1.name, c2.name
    `, params);

    return rows.map((row: any) => ({
      fromName: row.from_name,
      toName: row.to_name,
      avgMinutes: Number(row.avg_minutes ?? 0),
      samples: Number(row.samples ?? 0),
    }));
  }

  private async findTripForMutation(id: string, user: AuthUser): Promise<PlannedVehicleTrip> {
    if (!this.accessScope.canWrite(user)) throw new ForbiddenException('Немає прав змінювати поїздки');
    const trip = await this.trips.findOne({ where: { id }, relations: { route: true, checkpoints: true } });
    if (!trip) throw new NotFoundException('Поїздку не знайдено');
    if (!(await this.canAccessTripUnit(user, trip.unitId))) {
      throw new ForbiddenException('Немає доступу до поїздки цього підрозділу');
    }
    return trip;
  }

  private async canAccessTripUnit(user: AuthUser, unitId: string | null): Promise<boolean> {
    if (!unitId) return user.role === 'admin' || user.scope === 'main';
    return this.accessScope.canAccessUnit(user, unitId);
  }

  private emitLogistics(action: 'created' | 'updated' | 'completed', id: string, unitId?: string): void {
    this.realtime.emitMany(['logistics', 'map', 'analytics'], action, {
      entity: 'planned_trip',
      id,
      unitId,
    });
  }

  private normalizePoints(points: RoutePointInput[]) {
    if (!points?.length || points.length < 2) {
      throw new BadRequestException('Route needs at least two points');
    }

    return points.map((point) => {
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      if (!point.name?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new BadRequestException('Invalid route point');
      }
      return { name: point.name.trim(), lat, lng, isControl: !!point.isControl };
    });
  }

  private sliceRoutePoints(
    points: PlannedRoutePoint[],
    startRoutePointId?: string | null,
    endRoutePointId?: string | null,
  ): PlannedRoutePoint[] {
    const startIndex = startRoutePointId ? points.findIndex((point) => point.id === startRoutePointId) : 0;
    const endIndex = endRoutePointId ? points.findIndex((point) => point.id === endRoutePointId) : points.length - 1;

    if (startIndex < 0 || endIndex < 0) {
      throw new BadRequestException('Selected route point not found');
    }

    if (startIndex > endIndex) {
      return points
        .slice(endIndex, startIndex + 1)
        .reverse()
        .map((point, index) => ({
          ...point,
          sortOrder: index,
        }));
    }

    return points.slice(startIndex, endIndex + 1).map((point, index) => ({
      ...point,
      sortOrder: index,
    }));
  }

  private async buildTripRoutePoints(input: TripInput, fallbackRoute: PlannedRoute): Promise<PlannedRoutePoint[]> {
    const segments = input.segments?.filter((segment) => segment.routeId) || [];

    if (segments.length === 0) {
      return this.sliceRoutePoints(
        fallbackRoute.points.sort((a, b) => a.sortOrder - b.sortOrder),
        input.startRoutePointId,
        input.endRoutePointId,
      );
    }

    const output: PlannedRoutePoint[] = [];

    for (const segment of segments) {
      const route =
        segment.routeId === fallbackRoute.id
          ? fallbackRoute
          : await this.routes.findOne({ where: { id: segment.routeId }, relations: { points: true } });

      if (!route) throw new NotFoundException('Route not found');
      if (!route.points?.length) throw new BadRequestException('Route has no points');

      const points = this.sliceRoutePoints(
        route.points.sort((a, b) => a.sortOrder - b.sortOrder),
        segment.startRoutePointId,
        segment.endRoutePointId,
      );

      for (const point of points) {
        const previous = output[output.length - 1];
        if (previous && previous.id === point.id) continue;
        output.push(point);
      }
    }

    if (output.length < 2) throw new BadRequestException('Route needs at least two points');
    return output.map((point, index) => ({ ...point, sortOrder: index }));
  }

  private normalizeDestination(input: TripInput): {
    type: 'fire_position' | 'ew_position' | 'air_recon' | null;
    id: string | null;
    name: string | null;
    lat: number | null;
    lng: number | null;
  } {
    const type = input.destinationEntityType ?? null;
    const id = input.destinationEntityId ?? null;
    const name = input.destinationName?.trim() || null;
    const lat = input.destinationLat === null || input.destinationLat === undefined ? null : Number(input.destinationLat);
    const lng = input.destinationLng === null || input.destinationLng === undefined ? null : Number(input.destinationLng);

    if (!type && !id && !name) {
      return { type: null, id: null, name: null, lat: null, lng: null };
    }

    if (!type || !id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('Invalid destination point');
    }

    return { type, id, name, lat, lng };
  }

  private async ensureSchema() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS planned_routes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(160) NOT NULL,
        description TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS planned_route_points (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        route_id UUID NOT NULL REFERENCES planned_routes(id) ON DELETE CASCADE,
        name VARCHAR(160) NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        is_control BOOLEAN NOT NULL DEFAULT false,
        sort_order INT NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS planned_vehicle_trips (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        route_id UUID NOT NULL REFERENCES planned_routes(id),
        unit_id UUID NULL,
        vehicle_label VARCHAR(160) NOT NULL,
        driver_label VARCHAR(160) NULL,
        start_route_point_id UUID NULL,
        end_route_point_id UUID NULL,
        destination_entity_type VARCHAR(40) NULL,
        destination_entity_id UUID NULL,
        destination_name VARCHAR(160) NULL,
        trip_purpose TEXT NULL,
        planned_start_at TIMESTAMP NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'planned',
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS planned_vehicle_trip_checkpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES planned_vehicle_trips(id) ON DELETE CASCADE,
        route_point_id UUID NULL,
        name VARCHAR(160) NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        is_control BOOLEAN NOT NULL DEFAULT false,
        sort_order INT NOT NULL DEFAULT 0,
        passed_at TIMESTAMP NULL
      );
    `);
    await this.dataSource.query(`
      ALTER TABLE planned_vehicle_trips
      ADD COLUMN IF NOT EXISTS unit_id UUID NULL,
      ADD COLUMN IF NOT EXISTS start_route_point_id UUID NULL,
      ADD COLUMN IF NOT EXISTS end_route_point_id UUID NULL,
      ADD COLUMN IF NOT EXISTS destination_entity_type VARCHAR(40) NULL,
      ADD COLUMN IF NOT EXISTS destination_entity_id UUID NULL,
      ADD COLUMN IF NOT EXISTS destination_name VARCHAR(160) NULL,
      ADD COLUMN IF NOT EXISTS trip_purpose TEXT NULL
    `);
  }
}

