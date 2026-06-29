-- ЄВКЛІДА release UX/ammo seed
-- Без таблиць стрільби, дальностей і бойових установок. Тільки довідники номенклатури та облік.

ALTER TABLE charges ADD COLUMN IF NOT EXISTS charge_kind VARCHAR(20) DEFAULT 'unit';
ALTER TABLE charges ADD COLUMN IF NOT EXISTS modules_per_charge INTEGER;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS max_usable_modules INTEGER;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS module_note TEXT;
ALTER TABLE shell_compatible_charges ADD COLUMN IF NOT EXISTS usable_modules INTEGER;
ALTER TABLE shell_compatible_charges ADD COLUMN IF NOT EXISTS compatibility_note TEXT;
ALTER TABLE shell_compatible_charges ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS charge_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charge_id UUID NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
    zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
    label VARCHAR(100) NOT NULL,
    charge_units_per_shot NUMERIC(10,2) NOT NULL DEFAULT 1,
    is_default BOOLEAN DEFAULT false,
    note TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    UNIQUE(charge_id, zone_id, label)
);

INSERT INTO shells (system_type, damage_type, marking)
VALUES
('barrel', 'HE', 'M107'),
('barrel', 'HE', 'M795'),
('barrel', 'HE Base Bleed', 'M795E1'),
('barrel', 'HE Base Bleed', 'M795E2'),
('barrel', 'HERA', 'M549'),
('barrel', 'HERA', 'M549A1'),
('barrel', 'Smoke', 'M825'),
('barrel', 'Smoke', 'M825A1'),
('barrel', 'Illumination IR', 'M1123'),
('barrel', 'Illumination Visible', 'M1124'),
('barrel', 'Guided', 'M982 Excalibur'),
('barrel', 'Anti-armor', 'BONUS'),
('barrel', 'Anti-armor', 'SMArt 155')
ON CONFLICT (marking) DO NOTHING;

INSERT INTO charges (marking, packaging_type, measurement_unit, charge_kind, modules_per_charge, max_usable_modules, module_note)
VALUES
('M3A1', 'bagged', 'комплект', 'unit', NULL, NULL, NULL),
('M4A2', 'bagged', 'комплект', 'unit', NULL, NULL, NULL),
('M119', 'bagged', 'комплект', 'unit', NULL, NULL, NULL),
('M119A1', 'bagged', 'комплект', 'unit', NULL, NULL, NULL),
('M119A2', 'bagged', 'комплект', 'unit', NULL, NULL, NULL),
('M203', 'bagged', 'комплект', 'unit', NULL, NULL, NULL),
('M203A1', 'bagged', 'комплект', 'unit', NULL, NULL, NULL),
('M231 MACS', 'modular', 'модуль', 'modular', 1, 2, 'Модульний заряд. Зона не дорівнює автоматично кількості модулів; правило задається конфігурацією.'),
('M232 MACS', 'modular', 'модуль', 'modular', 1, 5, 'Модульний заряд. Списання через конфігурацію.'),
('M232A1 MACS', 'modular', 'модуль', 'modular', 1, 5, 'Модульний заряд. Списання через конфігурацію.'),
('L8A1', 'bagged', 'комплект', 'unit', NULL, NULL, NULL),
('L10A1', 'bagged', 'комплект', 'unit', NULL, NULL, NULL)
ON CONFLICT (marking) DO UPDATE SET
  packaging_type = EXCLUDED.packaging_type,
  measurement_unit = EXCLUDED.measurement_unit,
  charge_kind = EXCLUDED.charge_kind,
  modules_per_charge = EXCLUDED.modules_per_charge,
  max_usable_modules = EXCLUDED.max_usable_modules,
  module_note = EXCLUDED.module_note;

INSERT INTO fuzes (marking, material)
VALUES
('M557', 'standard'),
('M577', 'standard'),
('M582', 'standard'),
('M739', 'standard'),
('M739A1', 'standard'),
('M767', 'electronic time'),
('M767A1', 'electronic time'),
('M782 MOFA', 'multi-option'),
('M782E1 MOFA II', 'multi-option'),
('M732', 'proximity'),
('M732A2', 'proximity'),
('M1156 PGK', 'correction fuze'),
('DM84', 'multi-option'),
('L106', 'standard'),
('KZ984', 'standard')
ON CONFLICT (marking) DO NOTHING;

INSERT INTO primers (marking, ammo_type)
VALUES
('M82', '155mm'),
('M82A1', '155mm'),
('M100', '155mm'),
('M102', '155mm')
ON CONFLICT (marking) DO NOTHING;
