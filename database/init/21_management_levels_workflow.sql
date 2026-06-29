-- 21_management_levels_workflow.sql
-- Рівневе управління: ВП/батарея виконує, дивізіон і головний пункт контролюють.
-- Safe to run multiple times.

ALTER TABLE fire_missions
  ADD COLUMN IF NOT EXISTS author_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS author_unit_id uuid NULL REFERENCES units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS started_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS final_edit_until timestamp NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamp NULL;

ALTER TABLE fire_missions
  ADD COLUMN IF NOT EXISTS status varchar(50) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS actual_shell_quantity int NULL,
  ADD COLUMN IF NOT EXISTS actual_charge_quantity numeric(18,2) NULL,
  ADD COLUMN IF NOT EXISTS actual_primer_quantity int NULL,
  ADD COLUMN IF NOT EXISTS actual_fuze_quantity int NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS completion_comment text NULL;

UPDATE fire_missions SET status = 'draft' WHERE status = 'planned';

CREATE INDEX IF NOT EXISTS idx_fire_missions_author_user_id ON fire_missions(author_user_id);
CREATE INDEX IF NOT EXISTS idx_fire_missions_author_unit_id ON fire_missions(author_unit_id);
CREATE INDEX IF NOT EXISTS idx_fire_missions_executing_unit_id ON fire_missions(executing_unit_id);
CREATE INDEX IF NOT EXISTS idx_fire_missions_fire_position_id ON fire_missions(fire_position_id);
CREATE INDEX IF NOT EXISTS idx_fire_missions_status ON fire_missions(status);

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_unit_id uuid NULL REFERENCES units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_scope varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS sent_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actual_quantity numeric(12,3) NULL,
  ADD COLUMN IF NOT EXISTS selected_shell_id uuid NULL REFERENCES shells(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_charge_id uuid NULL REFERENCES charges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_zone_id uuid NULL REFERENCES zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_by_unit_name varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamp NULL;

-- Старые подготовленные/черновые задания без назначенного подразделения не должны быть видны нижним уровням.
UPDATE service_orders
SET assigned_unit_id = NULL,
    assigned_scope = NULL
WHERE status IN ('draft', 'proposed');

CREATE INDEX IF NOT EXISTS idx_service_orders_created_by_user_id ON service_orders(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_assigned_unit_id ON service_orders(assigned_unit_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_selected_fp_id ON service_orders(selected_fire_position_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status_assigned ON service_orders(status, assigned_unit_id);
