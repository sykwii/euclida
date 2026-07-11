CREATE TABLE IF NOT EXISTS execution_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  idempotency_key varchar(120) NOT NULL,
  execution_type varchar(30) NOT NULL,
  purpose varchar(30) NOT NULL,
  result varchar(30) NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  executor_type varchar(50) NULL,
  executor_id uuid NULL,
  executor_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity numeric(18,3) NOT NULL,
  resource_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  comment text NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversal_of_record_id uuid NULL REFERENCES execution_records(id) ON DELETE RESTRICT,
  CONSTRAINT chk_execution_records_quantity CHECK (quantity > 0),
  CONSTRAINT chk_execution_records_time CHECK (completed_at IS NULL OR completed_at >= started_at),
  CONSTRAINT chk_execution_records_type CHECK (execution_type IN ('artillery','mortar','mlrs','fpv','bomber','other')),
  CONSTRAINT chk_execution_records_purpose CHECK (purpose IN ('main','adjustment','warmup','calibration','test','other')),
  CONSTRAINT chk_execution_records_result CHECK (result IN ('executed','misfire','aborted','cancelled')),
  CONSTRAINT uq_execution_records_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_execution_records_service_order
  ON execution_records(service_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_execution_records_created_by
  ON execution_records(created_by_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_execution_records_executor
  ON execution_records(executor_type, executor_id);

CREATE TABLE IF NOT EXISTS execution_record_artillery (
  execution_record_id uuid PRIMARY KEY REFERENCES execution_records(id) ON DELETE CASCADE,
  composition_source varchar(20) NOT NULL,
  source_shot_configuration_id uuid NULL REFERENCES shot_configurations(id) ON DELETE SET NULL,
  weapon_model_id uuid NOT NULL REFERENCES weapon_models(id) ON DELETE RESTRICT,
  shell_id uuid NOT NULL REFERENCES shells(id) ON DELETE RESTRICT,
  fuze_id uuid NOT NULL REFERENCES fuzes(id) ON DELETE RESTRICT,
  primer_id uuid NOT NULL REFERENCES primers(id) ON DELETE RESTRICT,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  max_range_m integer NOT NULL,
  composition_snapshot jsonb NOT NULL,
  CONSTRAINT chk_execution_artillery_source CHECK (composition_source IN ('planned','template','manual')),
  CONSTRAINT chk_execution_artillery_range CHECK (max_range_m > 0)
);

CREATE INDEX IF NOT EXISTS idx_execution_record_artillery_template
  ON execution_record_artillery(source_shot_configuration_id);
CREATE INDEX IF NOT EXISTS idx_execution_record_artillery_weapon_model
  ON execution_record_artillery(weapon_model_id);

CREATE TABLE IF NOT EXISTS execution_record_charge_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_record_id uuid NOT NULL REFERENCES execution_records(id) ON DELETE CASCADE,
  charge_id uuid NOT NULL REFERENCES charges(id) ON DELETE RESTRICT,
  charge_name_snapshot varchar(255) NOT NULL,
  quantity_per_shot integer NOT NULL,
  accounting_unit varchar(20) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT chk_execution_charge_quantity CHECK (quantity_per_shot > 0),
  CONSTRAINT chk_execution_charge_sort CHECK (sort_order >= 0),
  CONSTRAINT chk_execution_charge_unit CHECK (accounting_unit IN ('piece','module')),
  CONSTRAINT uq_execution_charge_component UNIQUE (execution_record_id, charge_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_record_charges_record
  ON execution_record_charge_components(execution_record_id, sort_order);

CREATE TABLE IF NOT EXISTS execution_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  original_record_id uuid NOT NULL REFERENCES execution_records(id) ON DELETE RESTRICT,
  replacement_record_id uuid NULL REFERENCES execution_records(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_corrections_order
  ON execution_corrections(service_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_execution_corrections_original
  ON execution_corrections(original_record_id);
