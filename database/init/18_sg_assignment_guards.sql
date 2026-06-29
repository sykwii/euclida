-- 18_sg_assignment_guards.sql
-- Additional guards for СГ assignment state.
-- Safe to run multiple times.

ALTER TABLE weapon_systems
ADD COLUMN IF NOT EXISTS location_type VARCHAR(30) NOT NULL DEFAULT 'reserve';

ALTER TABLE weapon_systems
ADD COLUMN IF NOT EXISTS fire_position_id UUID NULL REFERENCES fire_positions(id) ON DELETE SET NULL;

-- Normalize invalid rows before adding constraints.
UPDATE weapon_systems
SET fire_position_id = NULL,
    updated_at = now()
WHERE location_type = 'reserve'
  AND fire_position_id IS NOT NULL;

UPDATE weapon_systems
SET location_type = 'reserve',
    updated_at = now()
WHERE location_type = 'fire_position'
  AND fire_position_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_weapon_systems_location_consistency'
  ) THEN
    ALTER TABLE weapon_systems
    ADD CONSTRAINT ck_weapon_systems_location_consistency
    CHECK (
      (location_type = 'reserve' AND fire_position_id IS NULL)
      OR
      (location_type = 'fire_position' AND fire_position_id IS NOT NULL)
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_weapon_systems_one_active_sg_per_fire_position
ON weapon_systems(fire_position_id)
WHERE location_type = 'fire_position'
  AND fire_position_id IS NOT NULL;
