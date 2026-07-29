CREATE TABLE IF NOT EXISTS app_settings (
  key varchar(100) PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value)
VALUES ('air_threat_radius_m', '5000')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS air_threats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_type varchar(100) NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  removed_at timestamp NULL
);

CREATE INDEX IF NOT EXISTS idx_air_threats_active_created
  ON air_threats(is_active, created_at DESC);

ALTER TABLE primers
  ALTER COLUMN ammo_type TYPE varchar(100),
  ALTER COLUMN ammo_type DROP NOT NULL;

ALTER TABLE weapon_deployments
  ALTER COLUMN from_location_type DROP NOT NULL,
  ALTER COLUMN to_location_type DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'zones'
      AND column_name = 'weapon_model'
  ) THEN
    ALTER TABLE zones ALTER COLUMN weapon_model DROP NOT NULL;
  END IF;
END
$$;

ALTER TABLE execution_record_artillery
  ALTER COLUMN zone_id DROP NOT NULL;

ALTER TABLE stock_movements
  ALTER COLUMN item_type TYPE varchar(50);

ALTER TABLE weapon_systems
  ADD COLUMN IF NOT EXISTS lat double precision NULL,
  ADD COLUMN IF NOT EXISTS lng double precision NULL,
  ADD COLUMN IF NOT EXISTS ammo_depot_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_attribute column_record
      ON column_record.attrelid = constraint_record.conrelid
     AND column_record.attnum = ANY (constraint_record.conkey)
    WHERE constraint_record.contype = 'f'
      AND constraint_record.conrelid = 'weapon_systems'::regclass
      AND constraint_record.confrelid = 'depots'::regclass
      AND column_record.attname = 'ammo_depot_id'
  ) THEN
    ALTER TABLE weapon_systems
      ADD CONSTRAINT fk_weapon_systems_ammo_depot
      FOREIGN KEY (ammo_depot_id)
      REFERENCES depots(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_weapon_systems_ammo_depot
  ON weapon_systems(ammo_depot_id);
