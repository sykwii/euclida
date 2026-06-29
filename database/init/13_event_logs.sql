CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  event_type VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,

  actor_user_id UUID NULL,
  actor_login VARCHAR(100) NULL,
  actor_name VARCHAR(255) NULL,
  actor_role VARCHAR(50) NULL,
  actor_scope VARCHAR(50) NULL,

  unit_id UUID NULL,
  unit_name VARCHAR(255) NULL,

  entity_type VARCHAR(100) NULL,
  entity_id UUID NULL,
  entity_name VARCHAR(255) NULL,

  title VARCHAR(255) NOT NULL,
  details TEXT NULL,

  metadata JSONB NULL,

  created_at TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT fk_event_logs_unit
    FOREIGN KEY (unit_id)
    REFERENCES units(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_event_logs_actor
    FOREIGN KEY (actor_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_logs_created_at
ON event_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_logs_unit_id
ON event_logs(unit_id);

CREATE INDEX IF NOT EXISTS idx_event_logs_type_action
ON event_logs(event_type, action);