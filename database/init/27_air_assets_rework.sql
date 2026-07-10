ALTER TABLE drone_models
ADD COLUMN IF NOT EXISTS camera_type VARCHAR(50) NOT NULL DEFAULT 'none';

ALTER TABLE air_recon_areas
ADD COLUMN IF NOT EXISTS planned_start_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS planned_end_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'planned';

CREATE INDEX IF NOT EXISTS idx_air_recon_areas_asset_position
ON air_recon_areas(air_asset_position_id);

CREATE INDEX IF NOT EXISTS idx_air_recon_areas_status
ON air_recon_areas(status);

CREATE INDEX IF NOT EXISTS idx_air_recon_areas_planned_window
ON air_recon_areas(planned_start_at, planned_end_at);
