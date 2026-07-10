CREATE TABLE IF NOT EXISTS drone_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  drone_group VARCHAR(50) NOT NULL,
  drone_type VARCHAR(50) NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drone_warhead_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  weight_kg NUMERIC(10,2),
  note TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS depot_drone_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  drone_model_id UUID NOT NULL REFERENCES drone_models(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT uq_depot_drone_stock UNIQUE (depot_id, drone_model_id)
);

CREATE TABLE IF NOT EXISTS depot_drone_warhead_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  warhead_type_id UUID NOT NULL REFERENCES drone_warhead_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT uq_depot_drone_warhead_stock UNIQUE (depot_id, warhead_type_id)
);

CREATE TABLE IF NOT EXISTS air_asset_drone_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  air_asset_position_id UUID NOT NULL REFERENCES air_asset_positions(id) ON DELETE CASCADE,
  drone_model_id UUID NOT NULL REFERENCES drone_models(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT uq_air_asset_drone_stock UNIQUE (air_asset_position_id, drone_model_id)
);

CREATE TABLE IF NOT EXISTS air_asset_warhead_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  air_asset_position_id UUID NOT NULL REFERENCES air_asset_positions(id) ON DELETE CASCADE,
  warhead_type_id UUID NOT NULL REFERENCES drone_warhead_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT uq_air_asset_warhead_stock UNIQUE (air_asset_position_id, warhead_type_id)
);

CREATE TABLE IF NOT EXISTS drone_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type VARCHAR(50) NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  depot_from_id UUID REFERENCES depots(id) ON DELETE SET NULL,
  depot_to_id UUID REFERENCES depots(id) ON DELETE SET NULL,
  air_asset_from_id UUID REFERENCES air_asset_positions(id) ON DELETE SET NULL,
  air_asset_to_id UUID REFERENCES air_asset_positions(id) ON DELETE SET NULL,
  drone_model_id UUID REFERENCES drone_models(id) ON DELETE SET NULL,
  warhead_type_id UUID REFERENCES drone_warhead_types(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  comment TEXT,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depot_drone_stock_depot ON depot_drone_stock(depot_id);
CREATE INDEX IF NOT EXISTS idx_depot_warhead_stock_depot ON depot_drone_warhead_stock(depot_id);
CREATE INDEX IF NOT EXISTS idx_air_asset_drone_stock_position ON air_asset_drone_stock(air_asset_position_id);
CREATE INDEX IF NOT EXISTS idx_air_asset_warhead_stock_position ON air_asset_warhead_stock(air_asset_position_id);
CREATE INDEX IF NOT EXISTS idx_drone_stock_movements_created_at ON drone_stock_movements(created_at);