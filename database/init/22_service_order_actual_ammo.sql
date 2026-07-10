ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS actual_charge_quantity NUMERIC(18, 3),
  ADD COLUMN IF NOT EXISTS actual_charge_modules_per_shot INTEGER;

ALTER TABLE service_orders
  ALTER COLUMN actual_charge_quantity TYPE NUMERIC(18, 3);

ALTER TABLE depot_charge_stock
  ALTER COLUMN quantity TYPE NUMERIC(18, 3);

UPDATE service_orders
SET actual_charge_quantity = actual_quantity
WHERE actual_charge_quantity IS NULL
  AND actual_quantity IS NOT NULL;
