CREATE EXTENSION IF NOT EXISTS postgis;

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

CREATE TABLE IF NOT EXISTS recon_correlations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(40) NOT NULL DEFAULT 'placeholder',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recon_puar_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES recon_targets(id) ON DELETE SET NULL,
  status varchar(40) NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

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
CREATE INDEX IF NOT EXISTS idx_recon_events_created ON recon_events (created_at);
