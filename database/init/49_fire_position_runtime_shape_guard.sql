ALTER TABLE fire_positions
  ADD COLUMN IF NOT EXISTS ammo_depot_id uuid NULL,
  ADD COLUMN IF NOT EXISTS main_direction_units numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS main_direction_degrees numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS traverse_left_units numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS traverse_left_degrees numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS traverse_right_units numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS traverse_right_degrees numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS sector_left_degrees integer NULL,
  ADD COLUMN IF NOT EXISTS sector_right_degrees integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_attribute column_record
      ON column_record.attrelid = constraint_record.conrelid
     AND column_record.attnum = ANY (constraint_record.conkey)
    WHERE constraint_record.contype = 'f'
      AND constraint_record.conrelid = 'fire_positions'::regclass
      AND constraint_record.confrelid = 'depots'::regclass
      AND column_record.attname = 'ammo_depot_id'
  ) THEN
    ALTER TABLE fire_positions
      ADD CONSTRAINT fk_fire_positions_ammo_depot
      FOREIGN KEY (ammo_depot_id)
      REFERENCES depots(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_fire_positions_ammo_depot
  ON fire_positions(ammo_depot_id);
