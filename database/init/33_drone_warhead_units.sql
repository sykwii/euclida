ALTER TABLE drone_warhead_types
  ADD COLUMN IF NOT EXISTS measure_unit VARCHAR(20) NOT NULL DEFAULT 'unit';

UPDATE drone_warhead_types
SET measure_unit = 'unit'
WHERE measure_unit IS NULL OR measure_unit NOT IN ('unit', 'kg');

ALTER TABLE depot_drone_warhead_stock
  ALTER COLUMN quantity TYPE NUMERIC(18, 3) USING quantity::numeric;

ALTER TABLE air_asset_warhead_stock
  ALTER COLUMN quantity TYPE NUMERIC(18, 3) USING quantity::numeric;

ALTER TABLE drone_stock_movements
  ALTER COLUMN quantity TYPE NUMERIC(18, 3) USING quantity::numeric;
