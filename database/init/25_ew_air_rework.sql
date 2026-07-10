CREATE TABLE IF NOT EXISTS ew_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    callsign VARCHAR(100) NOT NULL,
    station_name VARCHAR(255) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    mgrs VARCHAR(64),
    effect_mode VARCHAR(30) NOT NULL DEFAULT 'radius',
    radius_m INT,
    main_direction_units NUMERIC(10,2),
    main_direction_degrees NUMERIC(10,2),
    traverse_left_units NUMERIC(10,2),
    traverse_left_degrees NUMERIC(10,2),
    traverse_right_units NUMERIC(10,2),
    traverse_right_degrees NUMERIC(10,2),
    sector_left_degrees INT,
    sector_right_degrees INT,
    readiness_status VARCHAR(100) NOT NULL DEFAULT 'ready',
    not_ready_reason TEXT,
    personnel_rotation_date DATE,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ew_positions_unit_id ON ew_positions(unit_id);
CREATE INDEX IF NOT EXISTS idx_ew_positions_readiness ON ew_positions(readiness_status);

CREATE TABLE IF NOT EXISTS ew_frequency_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ew_position_id UUID NOT NULL REFERENCES ew_positions(id) ON DELETE CASCADE,
    label VARCHAR(120),
    frequency_from_mhz NUMERIC(12,3) NOT NULL,
    frequency_to_mhz NUMERIC(12,3) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ew_frequency_range CHECK (frequency_to_mhz >= frequency_from_mhz)
);

CREATE INDEX IF NOT EXISTS idx_ew_frequency_ranges_position_id ON ew_frequency_ranges(ew_position_id);

CREATE TABLE IF NOT EXISTS air_asset_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    callsign VARCHAR(100) NOT NULL,
    asset_group VARCHAR(30) NOT NULL,
    recon_type VARCHAR(60),
    combat_type VARCHAR(60),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    mgrs VARCHAR(64),
    readiness_status VARCHAR(100) NOT NULL DEFAULT 'ready',
    not_ready_reason TEXT,
    personnel_rotation_date DATE,
    asset_name VARCHAR(255),
    drone_model VARCHAR(255),
    asset_quantity INT NOT NULL DEFAULT 0,
    main_direction_units NUMERIC(10,2),
    main_direction_degrees NUMERIC(10,2),
    traverse_left_units NUMERIC(10,2),
    traverse_left_degrees NUMERIC(10,2),
    traverse_right_units NUMERIC(10,2),
    traverse_right_degrees NUMERIC(10,2),
    sector_left_degrees INT,
    sector_right_degrees INT,
    max_sector_distance_m INT,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_air_asset_group CHECK (asset_group IN ('recon', 'combat')),
    CONSTRAINT chk_air_asset_recon_type CHECK (recon_type IS NULL OR recon_type IN ('copter', 'fixed_wing')),
    CONSTRAINT chk_air_asset_combat_type CHECK (combat_type IS NULL OR combat_type IN ('fpv_radio', 'fpv_fiber', 'kamikaze', 'heavy_bomber'))
);

CREATE INDEX IF NOT EXISTS idx_air_asset_positions_unit_id ON air_asset_positions(unit_id);
CREATE INDEX IF NOT EXISTS idx_air_asset_positions_group ON air_asset_positions(asset_group);
CREATE INDEX IF NOT EXISTS idx_air_asset_positions_readiness ON air_asset_positions(readiness_status);

CREATE TABLE IF NOT EXISTS air_recon_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    air_asset_position_id UUID NOT NULL REFERENCES air_asset_positions(id) ON DELETE CASCADE,
    name VARCHAR(255),
    active_date DATE NOT NULL DEFAULT CURRENT_DATE,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_air_recon_areas_position_id ON air_recon_areas(air_asset_position_id);
CREATE INDEX IF NOT EXISTS idx_air_recon_areas_active_date ON air_recon_areas(active_date);

CREATE TABLE IF NOT EXISTS air_recon_area_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID NOT NULL REFERENCES air_recon_areas(id) ON DELETE CASCADE,
    point_order INT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(area_id, point_order)
);

CREATE INDEX IF NOT EXISTS idx_air_recon_area_points_area_id ON air_recon_area_points(area_id);

CREATE TABLE IF NOT EXISTS drone_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    drone_type VARCHAR(60) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(name, drone_type)
);

CREATE TABLE IF NOT EXISTS drone_warhead_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    weight_kg NUMERIC(10,2),
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS depot_drone_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
    drone_model_id UUID NOT NULL REFERENCES drone_models(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 0,
    UNIQUE(depot_id, drone_model_id)
);

CREATE TABLE IF NOT EXISTS depot_drone_warhead_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
    warhead_type_id UUID NOT NULL REFERENCES drone_warhead_types(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 0,
    UNIQUE(depot_id, warhead_type_id)
);

CREATE TABLE IF NOT EXISTS position_drone_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    air_asset_position_id UUID NOT NULL REFERENCES air_asset_positions(id) ON DELETE CASCADE,
    drone_model_id UUID NOT NULL REFERENCES drone_models(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 0,
    UNIQUE(air_asset_position_id, drone_model_id)
);

CREATE TABLE IF NOT EXISTS position_drone_warhead_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    air_asset_position_id UUID NOT NULL REFERENCES air_asset_positions(id) ON DELETE CASCADE,
    warhead_type_id UUID NOT NULL REFERENCES drone_warhead_types(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 0,
    UNIQUE(air_asset_position_id, warhead_type_id)
);

CREATE TABLE IF NOT EXISTS drone_stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type VARCHAR(60) NOT NULL,
    item_type VARCHAR(30) NOT NULL,
    drone_model_id UUID REFERENCES drone_models(id) ON DELETE RESTRICT,
    warhead_type_id UUID REFERENCES drone_warhead_types(id) ON DELETE RESTRICT,
    from_depot_id UUID REFERENCES depots(id) ON DELETE SET NULL,
    to_depot_id UUID REFERENCES depots(id) ON DELETE SET NULL,
    from_air_asset_position_id UUID REFERENCES air_asset_positions(id) ON DELETE SET NULL,
    to_air_asset_position_id UUID REFERENCES air_asset_positions(id) ON DELETE SET NULL,
    quantity INT NOT NULL,
    movement_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
    comment TEXT,
    CONSTRAINT chk_drone_stock_item_type CHECK (item_type IN ('drone', 'warhead')),
    CONSTRAINT chk_drone_stock_quantity CHECK (quantity > 0)
);
