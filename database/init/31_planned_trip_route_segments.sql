ALTER TABLE planned_vehicle_trips
  ADD COLUMN IF NOT EXISTS start_route_point_id UUID NULL,
  ADD COLUMN IF NOT EXISTS end_route_point_id UUID NULL,
  ADD COLUMN IF NOT EXISTS destination_entity_type VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS destination_entity_id UUID NULL,
  ADD COLUMN IF NOT EXISTS destination_name VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS trip_purpose TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_planned_vehicle_trips_start_point
  ON planned_vehicle_trips(start_route_point_id);

CREATE INDEX IF NOT EXISTS idx_planned_vehicle_trips_end_point
  ON planned_vehicle_trips(end_route_point_id);

CREATE INDEX IF NOT EXISTS idx_planned_vehicle_trips_destination
  ON planned_vehicle_trips(destination_entity_type, destination_entity_id);
