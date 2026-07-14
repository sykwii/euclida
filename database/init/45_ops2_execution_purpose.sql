ALTER TABLE execution_records
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';

UPDATE execution_records
SET purpose = CASE
    WHEN purpose = 'main' THEN 'main_fire'
    WHEN purpose = 'warmup' THEN 'barrel_warmup'
    WHEN purpose IN ('calibration', 'test') THEN 'other'
    ELSE purpose
  END
WHERE purpose IN ('main', 'warmup', 'calibration', 'test');

CREATE INDEX IF NOT EXISTS idx_execution_records_service_order_status
  ON execution_records(service_order_id, status);

CREATE INDEX IF NOT EXISTS idx_execution_records_purpose
  ON execution_records(purpose);
