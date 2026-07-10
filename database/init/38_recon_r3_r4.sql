CREATE EXTENSION IF NOT EXISTS postgis;

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

CREATE TABLE IF NOT EXISTS recon_processed_target_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES recon_targets(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES recon_observations(id) ON DELETE CASCADE,
  status varchar(40) NOT NULL DEFAULT 'pending',
  decision varchar(40),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS recon_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS source_recon_target_id uuid,
  ADD COLUMN IF NOT EXISTS source_recon_observation_id uuid,
  ADD COLUMN IF NOT EXISTS source_puar_proposal_id uuid,
  ADD COLUMN IF NOT EXISTS recon_snapshot_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS recon_link_checked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_correlations_target_impact
  ON recon_correlations (target_id, impact_id);
CREATE INDEX IF NOT EXISTS idx_recon_correlations_target ON recon_correlations (target_id, status, score);
CREATE INDEX IF NOT EXISTS idx_recon_correlations_impact ON recon_correlations (impact_id, status, score);
CREATE INDEX IF NOT EXISTS idx_recon_puar_status ON recon_puar_proposals (status, created_at);
CREATE INDEX IF NOT EXISTS idx_recon_puar_target ON recon_puar_proposals (target_id);
CREATE INDEX IF NOT EXISTS idx_recon_puar_observation ON recon_puar_proposals (observation_id);
CREATE INDEX IF NOT EXISTS idx_recon_processed_decisions_pending
  ON recon_processed_target_decisions (target_id, observation_id, status);
CREATE INDEX IF NOT EXISTS idx_service_orders_recon_puar
  ON service_orders (source_puar_proposal_id);
