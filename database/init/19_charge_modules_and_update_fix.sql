-- 19_charge_modules_and_update_fix.sql
-- Безопасное обновление для аналитики, модульных зарядов и совместимости заряд/снаряд.

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS charge_kind varchar(20) NOT NULL DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS modules_per_charge int NULL,
  ADD COLUMN IF NOT EXISTS max_usable_modules int NULL,
  ADD COLUMN IF NOT EXISTS module_note text NULL;

UPDATE charges
SET charge_kind = 'modular'
WHERE lower(coalesce(packaging_type, '')) IN ('модулі', 'модули', 'modules', 'modular')
  AND charge_kind = 'unit';

ALTER TABLE charges
  DROP CONSTRAINT IF EXISTS charges_charge_kind_check,
  ADD CONSTRAINT charges_charge_kind_check CHECK (charge_kind IN ('unit', 'modular'));

ALTER TABLE charges
  DROP CONSTRAINT IF EXISTS charges_modular_modules_check,
  ADD CONSTRAINT charges_modular_modules_check CHECK (
    charge_kind = 'unit'
    OR (
      modules_per_charge IS NOT NULL
      AND max_usable_modules IS NOT NULL
      AND modules_per_charge >= 1
      AND max_usable_modules >= 1
      AND max_usable_modules <= modules_per_charge
    )
  );

ALTER TABLE shell_compatible_charges
  ADD COLUMN IF NOT EXISTS usable_modules int NULL,
  ADD COLUMN IF NOT EXISTS compatibility_note text NULL,
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES zones(id) ON DELETE SET NULL;

ALTER TABLE shell_compatible_charges
  DROP CONSTRAINT IF EXISTS shell_compatible_charges_usable_modules_check,
  ADD CONSTRAINT shell_compatible_charges_usable_modules_check CHECK (
    usable_modules IS NULL OR usable_modules >= 1
  );

CREATE INDEX IF NOT EXISTS idx_shell_compatible_charges_zone_id
  ON shell_compatible_charges(zone_id);

CREATE INDEX IF NOT EXISTS idx_charges_charge_kind
  ON charges(charge_kind);
