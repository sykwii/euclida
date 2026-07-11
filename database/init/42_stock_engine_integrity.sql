CREATE TABLE IF NOT EXISTS stock_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key varchar(160) NOT NULL UNIQUE,
  operation_type varchar(30) NOT NULL,
  movement_group_id uuid NOT NULL UNIQUE,
  from_depot_id uuid NULL REFERENCES depots(id) ON DELETE RESTRICT,
  to_depot_id uuid NULL REFERENCES depots(id) ON DELETE RESTRICT,
  document_number varchar(80) NULL,
  comment text NULL,
  payload jsonb NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_stock_operation_depots CHECK (from_depot_id IS NOT NULL OR to_depot_id IS NOT NULL)
);

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS accounting_unit varchar(20) NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS stock_operation_id uuid NULL REFERENCES stock_operations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_operations_created_at ON stock_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_operations_from_depot ON stock_operations(from_depot_id);
CREATE INDEX IF NOT EXISTS idx_stock_operations_to_depot ON stock_operations(to_depot_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_group ON stock_movements(movement_group_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_type, item_id);
