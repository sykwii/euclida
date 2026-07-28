BEGIN;

ALTER TABLE weapon_systems
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS archived_by_user_id uuid NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM weapon_maintenances
    WHERE status IN ('opened', 'in_progress')
    GROUP BY weapon_system_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate active weapon maintenance rows must be resolved before creating the unique index';
  END IF;
END
$$;

WITH desired AS (
  SELECT
    weapon.id,
    active.status
  FROM weapon_systems weapon
  LEFT JOIN LATERAL (
    SELECT maintenance.status
    FROM weapon_maintenances maintenance
    WHERE maintenance.weapon_system_id = weapon.id
      AND maintenance.status IN ('opened', 'in_progress')
    ORDER BY maintenance.created_at DESC, maintenance.id DESC
    LIMIT 1
  ) active ON true
),
changed AS (
  UPDATE weapon_systems weapon
  SET maintenance_status = desired.status
  FROM desired
  WHERE weapon.id = desired.id
    AND weapon.maintenance_status IS DISTINCT FROM desired.status
  RETURNING weapon.id
)
SELECT count(*) AS synchronized_weapon_count
FROM changed;

CREATE UNIQUE INDEX IF NOT EXISTS
  ux_weapon_maintenances_one_active_per_weapon
ON weapon_maintenances (weapon_system_id)
WHERE status IN ('opened', 'in_progress');

COMMIT;
