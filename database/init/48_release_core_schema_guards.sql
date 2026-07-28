ALTER TABLE execution_records
  ADD COLUMN IF NOT EXISTS stock_operation_id uuid NULL
    REFERENCES stock_operations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_execution_records_stock_operation
  ON execution_records(stock_operation_id);

ALTER TABLE weapon_systems
  ADD COLUMN IF NOT EXISTS weapon_model_id uuid NULL
    REFERENCES weapon_models(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS archived_by_user_id uuid NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'weapon_systems'
      AND column_name = 'system_type'
  ) THEN
    ALTER TABLE weapon_systems ALTER COLUMN system_type DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'weapon_systems'
      AND column_name = 'model'
  ) THEN
    ALTER TABLE weapon_systems ALTER COLUMN model DROP NOT NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_weapon_systems_weapon_model
  ON weapon_systems(weapon_model_id);

CREATE INDEX IF NOT EXISTS idx_weapon_systems_active
  ON weapon_systems(is_archived, readiness_status);

CREATE TABLE IF NOT EXISTS operational_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NULL,
  recipient_unit_id uuid NULL,
  recipient_level varchar(30) NULL,
  type varchar(60) NOT NULL,
  severity varchar(30) NOT NULL,
  title varchar(255) NOT NULL,
  message text NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id uuid NOT NULL,
  action_url varchar(500) NULL,
  source_event_key varchar(255) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  read_at timestamp NULL,
  acknowledged_at timestamp NULL,
  actor_user_id uuid NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE operational_notifications
  ADD COLUMN IF NOT EXISTS source_event_key varchar(255),
  ADD COLUMN IF NOT EXISTS read_at timestamp NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_notifications_source_event_key
  ON operational_notifications(source_event_key);

CREATE INDEX IF NOT EXISTS idx_operational_notifications_unit_read
  ON operational_notifications(recipient_unit_id, read_at);

CREATE INDEX IF NOT EXISTS idx_operational_notifications_user_read
  ON operational_notifications(recipient_user_id, read_at);

CREATE INDEX IF NOT EXISTS idx_operational_notifications_type_created
  ON operational_notifications(type, created_at DESC);
