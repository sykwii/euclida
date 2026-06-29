CREATE TABLE IF NOT EXISTS operator_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_user_id uuid NOT NULL REFERENCES users(id),
  operator_login varchar(100) NOT NULL,
  operator_name varchar(255),
  unit_id uuid REFERENCES units(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status varchar(30) NOT NULL DEFAULT 'active',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_operator_shift_status CHECK (status IN ('active', 'completed')),
  CONSTRAINT chk_operator_shift_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_operator_shifts_one_active_per_user
ON operator_shifts(operator_user_id)
WHERE status = 'active' AND ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_operator_shifts_operator_user_id ON operator_shifts(operator_user_id);
CREATE INDEX IF NOT EXISTS idx_operator_shifts_unit_id ON operator_shifts(unit_id);
CREATE INDEX IF NOT EXISTS idx_operator_shifts_started_at ON operator_shifts(started_at DESC);
