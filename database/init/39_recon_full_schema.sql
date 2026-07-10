CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE recon_source_enum AS ENUM (
    'light_recon',
    'sound_recon',
    'counter_battery_complex',
    'air_recon',
    'allied_air_recon'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE recon_input_provider_enum AS ENUM ('manual', 'delta_import', 'api');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE recon_target_type_enum AS ENUM ('mortar', 'tube_artillery', 'mlrs');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE recon_target_status_enum AS ENUM (
    'candidate',
    'active',
    'confirmed',
    'stale',
    'hidden',
    'processed',
    'false_target',
    'needs_recon'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE recon_correlation_status_enum AS ENUM ('suggested', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS recon_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(120) NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recon_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'active',
  description text,
  geometry geometry(Polygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS recon_intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(180) NOT NULL,
  source varchar(60) NOT NULL,
  input_provider varchar(40) NOT NULL DEFAULT 'manual',
  report_datetime timestamptz NOT NULL DEFAULT now(),
  summary text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recon_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id varchar(120),
  external_id varchar(160),
  source varchar(60) NOT NULL,
  input_provider varchar(40) NOT NULL DEFAULT 'manual',
  target_type varchar(60) NOT NULL,
  observation_datetime timestamptz NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  mgrs varchar(40) NOT NULL,
  geometry geometry(Point, 4326) NOT NULL,
  report_id uuid REFERENCES recon_intelligence_reports(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  status varchar(40) NOT NULL DEFAULT 'active',
  hidden_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recon_impact_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id varchar(120),
  external_id varchar(160),
  source varchar(60) NOT NULL,
  input_provider varchar(40) NOT NULL DEFAULT 'manual',
  target_type varchar(60) NOT NULL,
  impact_datetime timestamptz NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  mgrs varchar(40) NOT NULL,
  geometry geometry(Point, 4326) NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  status varchar(40) NOT NULL DEFAULT 'active',
  hidden_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recon_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id varchar(120),
  target_type varchar(60) NOT NULL,
  possible_target_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(40) NOT NULL DEFAULT 'candidate',
  center geometry(Point, 4326) NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  mgrs varchar(40) NOT NULL,
  semi_major_m double precision NOT NULL DEFAULT 250,
  semi_minor_m double precision NOT NULL DEFAULT 120,
  azimuth_deg double precision NOT NULL DEFAULT 0,
  confidence_index integer NOT NULL DEFAULT 0,
  confidence_label varchar(40) NOT NULL DEFAULT 'low',
  activity_index integer NOT NULL DEFAULT 0,
  freshness_index integer NOT NULL DEFAULT 0,
  threat_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS recon_target_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES recon_targets(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES recon_observations(id) ON DELETE CASCADE,
  link_type varchar(40) NOT NULL DEFAULT 'clustered',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_id, observation_id)
);

CREATE TABLE IF NOT EXISTS recon_correlations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES recon_targets(id) ON DELETE CASCADE,
  impact_id uuid REFERENCES recon_impact_observations(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  status varchar(40) NOT NULL DEFAULT 'suggested',
  reason_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  distance_m double precision NOT NULL DEFAULT 0,
  time_delta_sec integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  UNIQUE(target_id, impact_id)
);

CREATE TABLE IF NOT EXISTS recon_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES recon_targets(id) ON DELETE CASCADE,
  proposed_by varchar(160),
  confirmed_by varchar(160),
  status varchar(40) NOT NULL DEFAULT 'proposed',
  assessment_type varchar(80) NOT NULL DEFAULT 'no_assessment',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recon_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar(80) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recon_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source varchar(60) NOT NULL DEFAULT 'delta_import',
  status varchar(40) NOT NULL DEFAULT 'preview',
  total_rows integer NOT NULL DEFAULT 0,
  accepted_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS recon_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES recon_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  error_code varchar(80) NOT NULL,
  message text NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recon_puar_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES recon_targets(id) ON DELETE SET NULL,
  observation_id uuid REFERENCES recon_observations(id) ON DELETE SET NULL,
  source_kind varchar(40) NOT NULL DEFAULT 'target',
  status varchar(40) NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  comments text,
  accepted_service_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE TABLE IF NOT EXISTS recon_processed_target_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES recon_targets(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES recon_observations(id) ON DELETE CASCADE,
  status varchar(40) NOT NULL DEFAULT 'pending',
  decision varchar(40),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE(target_id, observation_id, status)
);

ALTER TABLE recon_correlations
  ADD COLUMN IF NOT EXISTS target_id uuid REFERENCES recon_targets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS impact_id uuid REFERENCES recon_impact_observations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS distance_m double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_delta_sec integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

ALTER TABLE recon_puar_proposals
  ADD COLUMN IF NOT EXISTS observation_id uuid REFERENCES recon_observations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_kind varchar(40) NOT NULL DEFAULT 'target',
  ADD COLUMN IF NOT EXISTS comments text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS accepted_service_order_id uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

DO $$
BEGIN
  IF to_regclass('public.service_orders') IS NOT NULL THEN
    ALTER TABLE service_orders
      ADD COLUMN IF NOT EXISTS recon_snapshot jsonb,
      ADD COLUMN IF NOT EXISTS source_recon_target_id uuid,
      ADD COLUMN IF NOT EXISTS source_recon_observation_id uuid,
      ADD COLUMN IF NOT EXISTS source_puar_proposal_id uuid,
      ADD COLUMN IF NOT EXISTS recon_snapshot_updated_at timestamptz,
      ADD COLUMN IF NOT EXISTS recon_link_checked_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recon_areas_geom ON recon_areas USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_recon_observations_geom ON recon_observations USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_recon_impacts_geom ON recon_impact_observations USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_recon_targets_center ON recon_targets USING GIST (center);

CREATE INDEX IF NOT EXISTS idx_recon_observations_time ON recon_observations (observation_datetime);
CREATE INDEX IF NOT EXISTS idx_recon_observations_type ON recon_observations (target_type);
CREATE INDEX IF NOT EXISTS idx_recon_observations_status ON recon_observations (status);
CREATE INDEX IF NOT EXISTS idx_recon_observations_platform ON recon_observations (platform_id);
CREATE INDEX IF NOT EXISTS idx_recon_observations_external ON recon_observations (external_id);

CREATE INDEX IF NOT EXISTS idx_recon_impacts_time ON recon_impact_observations (impact_datetime);
CREATE INDEX IF NOT EXISTS idx_recon_impacts_type ON recon_impact_observations (target_type);
CREATE INDEX IF NOT EXISTS idx_recon_impacts_status ON recon_impact_observations (status);
CREATE INDEX IF NOT EXISTS idx_recon_impacts_platform ON recon_impact_observations (platform_id);
CREATE INDEX IF NOT EXISTS idx_recon_impacts_external ON recon_impact_observations (external_id);

CREATE INDEX IF NOT EXISTS idx_recon_targets_type ON recon_targets (target_type);
CREATE INDEX IF NOT EXISTS idx_recon_targets_status ON recon_targets (status);
CREATE INDEX IF NOT EXISTS idx_recon_targets_platform ON recon_targets (platform_id);
CREATE INDEX IF NOT EXISTS idx_recon_targets_created ON recon_targets (created_at);
CREATE INDEX IF NOT EXISTS idx_recon_targets_updated ON recon_targets (updated_at);

CREATE INDEX IF NOT EXISTS idx_recon_target_observations_target ON recon_target_observations (target_id);
CREATE INDEX IF NOT EXISTS idx_recon_target_observations_observation ON recon_target_observations (observation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_correlations_target_impact
  ON recon_correlations (target_id, impact_id);
CREATE INDEX IF NOT EXISTS idx_recon_correlations_target ON recon_correlations (target_id, status, score);
CREATE INDEX IF NOT EXISTS idx_recon_correlations_impact ON recon_correlations (impact_id, status, score);
CREATE INDEX IF NOT EXISTS idx_recon_events_created ON recon_events (created_at);
CREATE INDEX IF NOT EXISTS idx_recon_import_errors_batch ON recon_import_errors (batch_id);
CREATE INDEX IF NOT EXISTS idx_recon_puar_status ON recon_puar_proposals (status, created_at);
CREATE INDEX IF NOT EXISTS idx_recon_puar_target ON recon_puar_proposals (target_id);
CREATE INDEX IF NOT EXISTS idx_recon_puar_observation ON recon_puar_proposals (observation_id);
CREATE INDEX IF NOT EXISTS idx_recon_processed_decisions_pending
  ON recon_processed_target_decisions (target_id, observation_id, status);

DO $$
BEGIN
  IF to_regclass('public.service_orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_service_orders_recon_puar
      ON service_orders (source_puar_proposal_id);
  END IF;
END $$;
