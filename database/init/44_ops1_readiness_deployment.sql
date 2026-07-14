CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE weapon_systems
  ADD COLUMN IF NOT EXISTS deployment_status VARCHAR(40) NOT NULL DEFAULT 'reserve_area',
  ADD COLUMN IF NOT EXISTS current_fire_position_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_weapon_systems_current_fire_position'
  ) THEN
    ALTER TABLE weapon_systems
      ADD CONSTRAINT fk_weapon_systems_current_fire_position
      FOREIGN KEY (current_fire_position_id)
      REFERENCES fire_positions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS weapon_maintenances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  weapon_system_id UUID NOT NULL REFERENCES weapon_systems(id) ON DELETE CASCADE,
  reason VARCHAR(30) NOT NULL DEFAULT 'breakdown',
  status VARCHAR(30) NOT NULL DEFAULT 'opened',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expected_completed_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  description TEXT NULL,
  result TEXT NULL,
  opened_by_user_id UUID NULL,
  completed_by_user_id UUID NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_weapon_maintenances_reason
    CHECK (reason IN ('breakdown', 'scheduled', 'inspection', 'other')),
  CONSTRAINT chk_weapon_maintenances_status
    CHECK (status IN ('opened', 'in_progress', 'completed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS weapon_deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  weapon_system_id UUID NOT NULL REFERENCES weapon_systems(id) ON DELETE CASCADE,
  from_location_type VARCHAR(40) NOT NULL,
  from_location_id UUID NULL,
  to_location_type VARCHAR(40) NOT NULL,
  to_location_id UUID NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'planned',
  ordered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  departed_at TIMESTAMP NULL,
  arrived_at TIMESTAMP NULL,
  ordered_by_user_id UUID NULL,
  confirmed_by_user_id UUID NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_weapon_deployments_location_type
    CHECK (
      from_location_type IN ('reserve_area', 'fire_position')
      AND to_location_type IN ('reserve_area', 'fire_position')
    ),
  CONSTRAINT chk_weapon_deployments_status
    CHECK (status IN ('planned', 'moving', 'arrived', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_weapon_systems_deployment_status
  ON weapon_systems(deployment_status);
CREATE INDEX IF NOT EXISTS idx_weapon_systems_current_fire_position
  ON weapon_systems(current_fire_position_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_weapon_systems_current_fire_position_active
  ON weapon_systems(current_fire_position_id)
  WHERE current_fire_position_id IS NOT NULL
    AND deployment_status = 'at_fire_position';

CREATE INDEX IF NOT EXISTS idx_weapon_maintenances_weapon_status
  ON weapon_maintenances(weapon_system_id, status);
CREATE INDEX IF NOT EXISTS idx_weapon_deployments_weapon_status
  ON weapon_deployments(weapon_system_id, status);
CREATE INDEX IF NOT EXISTS idx_weapon_deployments_to_location
  ON weapon_deployments(to_location_type, to_location_id);

UPDATE weapon_systems
SET readiness_status = CASE
    WHEN readiness_status IN ('ready', 'combat_ready', 'ready_for_combat') THEN 'combat_ready'
    ELSE 'not_combat_ready'
  END,
  not_ready_reason = CASE
    WHEN readiness_status IN ('ready', 'combat_ready', 'ready_for_combat') THEN NULL
    WHEN not_ready_reason IN ('breakdown', 'threat', 'crew', 'maintenance', 'other') THEN not_ready_reason
    WHEN readiness_status = 'repair' THEN 'maintenance'
    ELSE COALESCE(NULLIF(not_ready_reason, ''), 'other')
  END;

UPDATE weapon_systems
SET current_fire_position_id = fire_position_id
WHERE current_fire_position_id IS NULL
  AND location_type = 'fire_position'
  AND fire_position_id IS NOT NULL;

UPDATE weapon_systems
SET deployment_status = CASE
    WHEN current_fire_position_id IS NOT NULL THEN 'at_fire_position'
    WHEN location_type = 'fire_position' AND fire_position_id IS NOT NULL THEN 'at_fire_position'
    ELSE 'reserve_area'
  END
WHERE deployment_status IS NULL
  OR deployment_status NOT IN (
    'reserve_area',
    'moving_to_fire_position',
    'at_fire_position',
    'moving_to_reserve_area'
  );

UPDATE weapon_systems
SET location_type = CASE
    WHEN deployment_status = 'at_fire_position' THEN 'fire_position'
    ELSE 'reserve'
  END,
  fire_position_id = CASE
    WHEN deployment_status = 'at_fire_position' THEN current_fire_position_id
    ELSE NULL
  END;

UPDATE fire_positions
SET readiness_status = CASE
    WHEN readiness_status IN ('ready', 'combat_ready', 'ready_for_combat') THEN 'combat_ready'
    ELSE 'not_combat_ready'
  END,
  not_ready_reason = CASE
    WHEN readiness_status IN ('ready', 'combat_ready', 'ready_for_combat') THEN NULL
    WHEN not_ready_reason IN ('threat', 'damaged', 'not_prepared', 'occupied', 'other') THEN not_ready_reason
    WHEN has_sg = FALSE THEN 'not_prepared'
    ELSE COALESCE(NULLIF(not_ready_reason, ''), 'other')
  END;

INSERT INTO weapon_deployments (
  weapon_system_id,
  from_location_type,
  from_location_id,
  to_location_type,
  to_location_id,
  status,
  ordered_at,
  departed_at,
  arrived_at,
  note,
  created_at,
  updated_at
)
SELECT
  ws.id,
  'reserve_area',
  NULL,
  'fire_position',
  ws.current_fire_position_id,
  'arrived',
  COALESCE(ws.created_at, NOW()),
  COALESCE(ws.updated_at, NOW()),
  COALESCE(ws.updated_at, NOW()),
  'Backfilled from legacy weapon assignment',
  NOW(),
  NOW()
FROM weapon_systems ws
WHERE ws.current_fire_position_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM weapon_deployments wd
    WHERE wd.weapon_system_id = ws.id
      AND wd.status = 'arrived'
      AND wd.to_location_id = ws.current_fire_position_id
  );

INSERT INTO weapon_maintenances (
  weapon_system_id,
  reason,
  status,
  started_at,
  expected_completed_at,
  completed_at,
  description,
  opened_by_user_id,
  completed_by_user_id,
  created_at,
  updated_at
)
SELECT
  ws.id,
  CASE WHEN ws.maintenance_status IS NOT NULL THEN 'scheduled' ELSE 'breakdown' END,
  CASE
    WHEN ws.maintenance_status IN ('pending') THEN 'opened'
    WHEN ws.maintenance_status IN ('approved') THEN 'in_progress'
    WHEN ws.maintenance_status IN ('completed') THEN 'completed'
    WHEN ws.maintenance_status IN ('cancelled') THEN 'cancelled'
    ELSE 'opened'
  END,
  COALESCE(ws.maintenance_requested_start_at, ws.created_at, NOW()),
  ws.maintenance_planned_end_at,
  ws.maintenance_actual_end_at,
  ws.maintenance_note,
  ws.maintenance_requested_by_user_id,
  ws.maintenance_approved_by_user_id,
  NOW(),
  NOW()
FROM weapon_systems ws
WHERE ws.maintenance_status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM weapon_maintenances wm
    WHERE wm.weapon_system_id = ws.id
      AND wm.started_at = COALESCE(ws.maintenance_requested_start_at, ws.created_at, NOW())
  );
