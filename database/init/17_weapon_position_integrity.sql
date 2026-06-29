-- 17_weapon_position_integrity.sql
-- Fixes СГ <-> ВП integrity after moves between РЗ and ВП.
-- Safe to run multiple times.

ALTER TABLE weapon_systems
ADD COLUMN IF NOT EXISTS location_type VARCHAR(30) NOT NULL DEFAULT 'reserve';

ALTER TABLE weapon_systems
ADD COLUMN IF NOT EXISTS fire_position_id UUID NULL REFERENCES fire_positions(id) ON DELETE SET NULL;

ALTER TABLE fire_positions
ADD COLUMN IF NOT EXISTS has_sg BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE fire_positions
ADD COLUMN IF NOT EXISTS readiness_status VARCHAR(100) NOT NULL DEFAULT 'unknown';

ALTER TABLE fire_positions
ADD COLUMN IF NOT EXISTS not_ready_reason TEXT NULL;

-- Normalize inconsistent rows: if there is no fire_position_id, СГ is in reserve.
UPDATE weapon_systems
SET location_type = 'reserve'
WHERE fire_position_id IS NULL
  AND location_type = 'fire_position';

-- If several СГ are linked to the same ВП, keep only the newest one on the ВП.
-- Older duplicates are moved to РЗ so one ВП cannot receive several active СГ.
WITH ranked AS (
  SELECT
    id,
    fire_position_id,
    ROW_NUMBER() OVER (
      PARTITION BY fire_position_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM weapon_systems
  WHERE location_type = 'fire_position'
    AND fire_position_id IS NOT NULL
)
UPDATE weapon_systems ws
SET
  location_type = 'reserve',
  fire_position_id = NULL,
  updated_at = now()
FROM ranked r
WHERE ws.id = r.id
  AND r.rn > 1;

-- Enforce one active СГ per ВП.
CREATE UNIQUE INDEX IF NOT EXISTS ux_weapon_systems_one_active_sg_per_fire_position
ON weapon_systems(fire_position_id)
WHERE location_type = 'fire_position'
  AND fire_position_id IS NOT NULL;

-- Recalculate ВП state from current СГ location/readiness.
UPDATE fire_positions fp
SET
  has_sg = EXISTS (
    SELECT 1
    FROM weapon_systems ws
    WHERE ws.fire_position_id = fp.id
      AND ws.location_type = 'fire_position'
  ),
  unit_id = COALESCE((
    SELECT ws.unit_id
    FROM weapon_systems ws
    WHERE ws.fire_position_id = fp.id
      AND ws.location_type = 'fire_position'
    ORDER BY ws.updated_at DESC NULLS LAST, ws.created_at DESC NULLS LAST
    LIMIT 1
  ), fp.unit_id),
  readiness_status = CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM weapon_systems ws
      WHERE ws.fire_position_id = fp.id
        AND ws.location_type = 'fire_position'
    ) THEN 'not_ready'
    WHEN EXISTS (
      SELECT 1
      FROM weapon_systems ws
      WHERE ws.fire_position_id = fp.id
        AND ws.location_type = 'fire_position'
        AND ws.readiness_status = 'ready'
    ) THEN 'ready'
    ELSE 'not_ready'
  END,
  not_ready_reason = CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM weapon_systems ws
      WHERE ws.fire_position_id = fp.id
        AND ws.location_type = 'fire_position'
    ) THEN 'Відсутня СГ'
    WHEN EXISTS (
      SELECT 1
      FROM weapon_systems ws
      WHERE ws.fire_position_id = fp.id
        AND ws.location_type = 'fire_position'
        AND ws.readiness_status = 'ready'
    ) THEN NULL
    ELSE COALESCE((
      SELECT ws.not_ready_reason
      FROM weapon_systems ws
      WHERE ws.fire_position_id = fp.id
        AND ws.location_type = 'fire_position'
      ORDER BY ws.updated_at DESC NULLS LAST, ws.created_at DESC NULLS LAST
      LIMIT 1
    ), 'СГ не БГ')
  END,
  updated_at = now();
