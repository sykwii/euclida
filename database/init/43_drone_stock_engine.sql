ALTER TABLE stock_operations
  ADD COLUMN IF NOT EXISTS source_storage_type varchar(30) NULL,
  ADD COLUMN IF NOT EXISTS source_storage_id uuid NULL,
  ADD COLUMN IF NOT EXISTS destination_storage_type varchar(30) NULL,
  ADD COLUMN IF NOT EXISTS destination_storage_id uuid NULL;

ALTER TABLE drone_stock_movements
  ADD COLUMN IF NOT EXISTS movement_group_id uuid NULL,
  ADD COLUMN IF NOT EXISTS stock_operation_id uuid NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(160) NULL;

CREATE INDEX IF NOT EXISTS idx_drone_stock_movements_group
  ON drone_stock_movements(movement_group_id);

CREATE INDEX IF NOT EXISTS idx_drone_stock_movements_operation
  ON drone_stock_movements(stock_operation_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_drone_stock_movements_idempotency
  ON drone_stock_movements(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
ALTER TABLE stock_operations
  DROP CONSTRAINT IF EXISTS chk_stock_operation_depots;

ALTER TABLE stock_operations
  DROP CONSTRAINT IF EXISTS chk_stock_operation_locations;

ALTER TABLE stock_operations
  ADD CONSTRAINT chk_stock_operation_locations
  CHECK (
    from_depot_id IS NOT NULL
    OR to_depot_id IS NOT NULL
    OR source_storage_id IS NOT NULL
    OR destination_storage_id IS NOT NULL
  );

