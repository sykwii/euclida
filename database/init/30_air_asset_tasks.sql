CREATE TABLE IF NOT EXISTS air_asset_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type VARCHAR(30) NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit_id UUID NOT NULL REFERENCES units(id),
  air_asset_position_id UUID NOT NULL REFERENCES air_asset_positions(id) ON DELETE CASCADE,
  drone_model_id UUID NULL REFERENCES drone_models(id),
  warhead_type_id UUID NULL REFERENCES drone_warhead_types(id),
  area_name VARCHAR(255) NOT NULL,
  planned_start_at TIMESTAMP NULL,
  planned_end_at TIMESTAMP NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'planned',
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS air_asset_task_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES air_asset_tasks(id) ON DELETE CASCADE,
  point_order INT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_air_asset_tasks_unit ON air_asset_tasks(unit_id);
CREATE INDEX IF NOT EXISTS idx_air_asset_tasks_asset ON air_asset_tasks(air_asset_position_id);
CREATE INDEX IF NOT EXISTS idx_air_asset_tasks_status ON air_asset_tasks(status);
CREATE INDEX IF NOT EXISTS idx_air_asset_task_points_task ON air_asset_task_points(task_id);
