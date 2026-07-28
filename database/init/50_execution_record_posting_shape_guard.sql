ALTER TABLE execution_records
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS posted_by_user_id uuid NULL;

UPDATE execution_records
SET purpose = CASE
    WHEN purpose = 'main' THEN 'main_fire'
    WHEN purpose = 'warmup' THEN 'barrel_warmup'
    WHEN purpose IN ('calibration', 'test') THEN 'other'
    ELSE purpose
  END
WHERE purpose IN ('main', 'warmup', 'calibration', 'test');

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
      'other'
    )
  );
