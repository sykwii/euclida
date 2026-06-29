ALTER TABLE service_orders
ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL,
ADD COLUMN IF NOT EXISTS assigned_unit_id UUID NULL,
ADD COLUMN IF NOT EXISTS assigned_scope VARCHAR(50) NULL,
ADD COLUMN IF NOT EXISTS sent_by_user_id UUID NULL,
ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID NULL,
ADD COLUMN IF NOT EXISTS completed_by_user_id UUID NULL;

ALTER TABLE fire_positions
ADD COLUMN IF NOT EXISTS built_by_unit_id UUID NULL;

ALTER TABLE service_orders
DROP CONSTRAINT IF EXISTS chk_service_orders_assigned_scope;

ALTER TABLE service_orders
ADD CONSTRAINT chk_service_orders_assigned_scope
CHECK (
  assigned_scope IS NULL OR assigned_scope IN ('division', 'battery')
);