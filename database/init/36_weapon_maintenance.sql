ALTER TABLE weapon_systems
  ADD COLUMN IF NOT EXISTS maintenance_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS maintenance_requested_start_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS maintenance_planned_end_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS maintenance_actual_end_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS maintenance_note TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_requested_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS maintenance_approved_by_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_weapon_systems_maintenance_window
  ON weapon_systems (maintenance_status, maintenance_requested_start_at, maintenance_planned_end_at);
