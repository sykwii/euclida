CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE execution_records
  ADD COLUMN IF NOT EXISTS stock_operation_id uuid NULL,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS posted_by_user_id uuid NULL;

ALTER TABLE execution_records
  DROP CONSTRAINT IF EXISTS chk_execution_records_purpose;

ALTER TABLE execution_records
  ADD CONSTRAINT chk_execution_records_purpose
  CHECK (
    purpose IN (
      'barrel_warmup',
      'adjustment',
      'main_fire',
      'additional_fire',
      'other',
      'main',
      'warmup',
      'calibration',
      'test'
    )
  );

DO $$
BEGIN
  IF to_regclass('public.stock_operations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'fk_execution_records_stock_operation'
     ) THEN
    ALTER TABLE execution_records
      ADD CONSTRAINT fk_execution_records_stock_operation
      FOREIGN KEY (stock_operation_id) REFERENCES stock_operations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS execution_record_artillery (
  execution_record_id uuid PRIMARY KEY REFERENCES execution_records(id) ON DELETE CASCADE,
  composition_source varchar(20) NOT NULL,
  source_shot_configuration_id uuid NULL,
  weapon_model_id uuid NOT NULL,
  shell_id uuid NOT NULL,
  fuze_id uuid NOT NULL,
  primer_id uuid NOT NULL,
  zone_id uuid NULL,
  max_range_m integer NOT NULL,
  composition_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS execution_record_charge_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_record_id uuid NOT NULL REFERENCES execution_record_artillery(execution_record_id) ON DELETE CASCADE,
  charge_id uuid NOT NULL,
  charge_name_snapshot varchar(255) NOT NULL,
  quantity_per_shot integer NOT NULL CHECK (quantity_per_shot > 0),
  accounting_unit varchar(20) NOT NULL CHECK (accounting_unit IN ('piece', 'module')),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_execution_records_service_order
  ON execution_records(service_order_id);

CREATE INDEX IF NOT EXISTS idx_execution_records_status
  ON execution_records(status);

CREATE INDEX IF NOT EXISTS idx_execution_record_charge_components_record
  ON execution_record_charge_components(execution_record_id);
