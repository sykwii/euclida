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
  vehicle_label VARCHAR(160) NOT NULL,
  driver_label VARCHAR(160) NULL,
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

CREATE INDEX IF NOT EXISTS idx_planned_route_points_route
  ON planned_route_points(route_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_planned_vehicle_trips_status
  ON planned_vehicle_trips(status, planned_start_at);

CREATE INDEX IF NOT EXISTS idx_planned_vehicle_trip_checkpoints_trip
  ON planned_vehicle_trip_checkpoints(trip_id, sort_order);
