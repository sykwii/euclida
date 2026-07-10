ALTER TABLE event_logs
ADD COLUMN IF NOT EXISTS read_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_event_logs_read_at
ON event_logs(read_at);

-- Cleanup legacy training rows that cannot be used because they have no unit.
UPDATE users
SET is_active = false
WHERE scope <> 'main'
  AND unit_id IS NULL;

UPDATE depots
SET is_archived = true
WHERE unit_id IS NULL
  AND depot_type <> 'main_pas';

DELETE FROM weapon_systems ws
WHERE ws.unit_id IS NULL
  AND ws.fire_position_id IS NULL;

DELETE FROM fire_positions fp
WHERE fp.unit_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM service_orders so WHERE so.selected_fire_position_id = fp.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM fire_missions fm WHERE fm.fire_position_id = fp.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM weapon_systems ws WHERE ws.fire_position_id = fp.id
  );
