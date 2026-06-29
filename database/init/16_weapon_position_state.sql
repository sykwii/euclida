-- Состояние СГ на ВП / РЗ и готовность ВП.
-- Скрипт безопасен для повторного применения.

ALTER TABLE weapon_systems
  ADD COLUMN IF NOT EXISTS location_type varchar(30) NOT NULL DEFAULT 'reserve';

ALTER TABLE weapon_systems
  ADD COLUMN IF NOT EXISTS fire_position_id uuid NULL REFERENCES fire_positions(id) ON DELETE SET NULL;

ALTER TABLE fire_positions
  ADD COLUMN IF NOT EXISTS has_sg boolean NOT NULL DEFAULT false;

ALTER TABLE fire_positions
  ADD COLUMN IF NOT EXISTS readiness_status varchar(100) NOT NULL DEFAULT 'not_ready';

ALTER TABLE fire_positions
  ADD COLUMN IF NOT EXISTS not_ready_reason text;

CREATE INDEX IF NOT EXISTS idx_weapon_systems_location_type
ON weapon_systems(location_type);

CREATE INDEX IF NOT EXISTS idx_weapon_systems_fire_position_id
ON weapon_systems(fire_position_id);

-- Только одна активная СГ может находиться на одной ВП.
CREATE UNIQUE INDEX IF NOT EXISTS uq_weapon_systems_one_weapon_per_fire_position
ON weapon_systems(fire_position_id)
WHERE fire_position_id IS NOT NULL AND location_type = 'fire_position';

-- Нормализация старых данных.
UPDATE weapon_systems
SET location_type = 'reserve'
WHERE location_type IS NULL OR location_type NOT IN ('reserve', 'fire_position');

UPDATE weapon_systems
SET location_type = 'reserve', fire_position_id = NULL
WHERE location_type = 'reserve' AND fire_position_id IS NOT NULL;

-- Пересчет готовности ВП по фактическому наличию СГ.
UPDATE fire_positions fp
SET
  has_sg = false,
  readiness_status = 'not_ready',
  not_ready_reason = 'Відсутня СГ'
WHERE NOT EXISTS (
  SELECT 1
  FROM weapon_systems ws
  WHERE ws.fire_position_id = fp.id
    AND ws.location_type = 'fire_position'
);

UPDATE fire_positions fp
SET
  has_sg = true,
  unit_id = ws.unit_id,
  readiness_status = CASE WHEN ws.readiness_status = 'ready' THEN 'ready' ELSE 'not_ready' END,
  not_ready_reason = CASE
    WHEN ws.readiness_status = 'ready' THEN NULL
    WHEN ws.readiness_status = 'repair' THEN 'СГ в ремонті'
    ELSE COALESCE(ws.not_ready_reason, 'СГ не БГ')
  END
FROM weapon_systems ws
WHERE ws.fire_position_id = fp.id
  AND ws.location_type = 'fire_position';
