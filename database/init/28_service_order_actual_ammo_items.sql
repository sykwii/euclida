CREATE TABLE IF NOT EXISTS service_order_actual_ammo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  shell_id UUID NOT NULL REFERENCES shells(id),
  charge_id UUID NOT NULL REFERENCES charges(id),
  shot_quantity NUMERIC NOT NULL CHECK (shot_quantity > 0),
  charge_quantity NUMERIC(18, 3) NOT NULL CHECK (charge_quantity > 0),
  charge_modules_per_shot INT NULL CHECK (charge_modules_per_shot IS NULL OR charge_modules_per_shot > 0),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_order_actual_ammo_order
  ON service_order_actual_ammo(service_order_id);

CREATE INDEX IF NOT EXISTS idx_service_order_actual_ammo_shell_charge
  ON service_order_actual_ammo(shell_id, charge_id);
