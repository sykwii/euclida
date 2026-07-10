ALTER TABLE fire_positions
ADD COLUMN IF NOT EXISTS position_type VARCHAR(60) NOT NULL DEFAULT 'fire_position';

UPDATE fire_positions
SET position_type = 'fire_position'
WHERE position_type IS NULL OR TRIM(position_type) = '';

CREATE INDEX IF NOT EXISTS idx_fire_positions_position_type
ON fire_positions(position_type);

CREATE TABLE IF NOT EXISTS air_asset_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    unit_id UUID NULL REFERENCES units(id) ON DELETE SET NULL,
    platform_type VARCHAR(100) NOT NULL DEFAULT 'uav',
    callsign VARCHAR(100),
    readiness_status VARCHAR(100) NOT NULL DEFAULT 'ready',
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    mgrs VARCHAR(64),
    endurance_minutes INT,
    payload VARCHAR(255),
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_air_asset_calculations_unit_id
ON air_asset_calculations(unit_id);

CREATE INDEX IF NOT EXISTS idx_air_asset_calculations_readiness
ON air_asset_calculations(readiness_status);
