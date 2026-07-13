CREATE TABLE IF NOT EXISTS shot_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    weapon_model_id UUID NOT NULL REFERENCES weapon_models(id) ON DELETE RESTRICT,
    shell_id UUID NOT NULL REFERENCES shells(id) ON DELETE RESTRICT,
    fuze_id UUID NULL REFERENCES fuzes(id) ON DELETE RESTRICT,
    primer_id UUID NULL REFERENCES primers(id) ON DELETE RESTRICT,
    zone_id UUID NULL REFERENCES zones(id) ON DELETE RESTRICT,
    zone_number INTEGER NULL,
    max_range_m INTEGER NOT NULL CHECK (max_range_m > 0),
    is_active BOOLEAN NOT NULL DEFAULT false,
    note TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_shot_configurations_weapon_model_name UNIQUE (weapon_model_id, name)
);

ALTER TABLE shot_configurations
    ADD COLUMN IF NOT EXISTS zone_number INTEGER NULL;

ALTER TABLE shot_configurations
    ADD COLUMN IF NOT EXISTS zone_id UUID NULL REFERENCES zones(id) ON DELETE RESTRICT;

ALTER TABLE shot_configurations
    ALTER COLUMN is_active SET DEFAULT false;

UPDATE shot_configurations sc
SET zone_number = z.zone_number
FROM zones z
WHERE sc.zone_id = z.id
  AND sc.zone_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_shot_configurations_weapon_model
    ON shot_configurations(weapon_model_id);

CREATE INDEX IF NOT EXISTS idx_shot_configurations_zone
    ON shot_configurations(zone_id);

CREATE INDEX IF NOT EXISTS idx_shot_configurations_zone_number
    ON shot_configurations(zone_number);

CREATE INDEX IF NOT EXISTS idx_shot_configurations_active
    ON shot_configurations(is_active);

CREATE TABLE IF NOT EXISTS shot_configuration_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shot_configuration_id UUID NOT NULL REFERENCES shot_configurations(id) ON DELETE CASCADE,
    charge_id UUID NOT NULL REFERENCES charges(id) ON DELETE RESTRICT,
    accounting_unit VARCHAR(10) NULL,
    quantity_per_shot INTEGER NOT NULL CHECK (quantity_per_shot > 0),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    CONSTRAINT uq_shot_configuration_charge UNIQUE (shot_configuration_id, charge_id)
);

ALTER TABLE shot_configuration_charges
    ADD COLUMN IF NOT EXISTS accounting_unit VARCHAR(10) NULL;

UPDATE shot_configuration_charges scc
SET accounting_unit = CASE
    WHEN c.charge_kind = 'modular' THEN 'module'
    ELSE 'piece'
END
FROM charges c
WHERE scc.charge_id = c.id
  AND (scc.accounting_unit IS NULL OR scc.accounting_unit NOT IN ('piece', 'module'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_shot_configuration_charges_accounting_unit'
    ) THEN
        ALTER TABLE shot_configuration_charges
            ADD CONSTRAINT chk_shot_configuration_charges_accounting_unit
            CHECK (accounting_unit IN ('piece', 'module'));
    END IF;
END $$;

ALTER TABLE shot_configuration_charges
    ALTER COLUMN accounting_unit SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shot_configuration_charges_config_sort
    ON shot_configuration_charges(shot_configuration_id, sort_order);

ALTER TABLE service_orders
    ADD COLUMN IF NOT EXISTS selected_shot_configuration_id UUID NULL REFERENCES shot_configurations(id) ON DELETE SET NULL;

ALTER TABLE service_orders
    ADD COLUMN IF NOT EXISTS actual_shot_configuration_snapshot JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_selected_shot_configuration
    ON service_orders(selected_shot_configuration_id);

CREATE TABLE IF NOT EXISTS service_order_actual_shot_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_id UUID NOT NULL UNIQUE REFERENCES service_orders(id) ON DELETE CASCADE,
    shot_configuration_id UUID NULL REFERENCES shot_configurations(id) ON DELETE SET NULL,
    configuration_name VARCHAR(255) NOT NULL,
    weapon_model_id UUID NULL REFERENCES weapon_models(id) ON DELETE SET NULL,
    shell_id UUID NOT NULL REFERENCES shells(id) ON DELETE RESTRICT,
    shell_marking VARCHAR(100) NOT NULL,
    fuze_id UUID NULL REFERENCES fuzes(id) ON DELETE SET NULL,
    fuze_marking VARCHAR(100) NULL,
    primer_id UUID NULL REFERENCES primers(id) ON DELETE SET NULL,
    primer_marking VARCHAR(100) NULL,
    zone_id UUID NULL REFERENCES zones(id) ON DELETE SET NULL,
    zone_number INTEGER NULL,
    max_range_m INTEGER NOT NULL CHECK (max_range_m > 0),
    snapshot JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE service_order_actual_shot_configurations
    ADD COLUMN IF NOT EXISTS zone_number INTEGER NULL;

UPDATE service_order_actual_shot_configurations soasc
SET zone_number = z.zone_number
FROM zones z
WHERE soasc.zone_id = z.id
  AND soasc.zone_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_order_actual_shot_configurations_config
    ON service_order_actual_shot_configurations(shot_configuration_id);

CREATE TABLE IF NOT EXISTS service_order_actual_shot_configuration_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actual_shot_configuration_id UUID NOT NULL REFERENCES service_order_actual_shot_configurations(id) ON DELETE CASCADE,
    charge_id UUID NOT NULL REFERENCES charges(id) ON DELETE RESTRICT,
    charge_marking VARCHAR(100) NOT NULL,
    accounting_unit VARCHAR(10) NOT NULL CHECK (accounting_unit IN ('piece', 'module')),
    quantity_per_shot INTEGER NOT NULL CHECK (quantity_per_shot > 0),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_service_order_actual_shot_configuration_charges_parent
    ON service_order_actual_shot_configuration_charges(actual_shot_configuration_id, sort_order);

WITH legacy_pairs AS (
    SELECT
        scc.id AS compatibility_id,
        z.weapon_model_id AS weapon_model_id,
        scc.shell_id,
        scc.charge_id,
        scc.zone_id,
        z.zone_number,
        scc.max_range_m,
        s.marking AS shell_marking,
        c.marking AS charge_marking,
        CASE
            WHEN c.charge_kind = 'modular' THEN 'module'
            ELSE 'piece'
        END AS accounting_unit,
        COALESCE(cfg.charge_units_per_shot, 1)::INTEGER AS quantity_per_shot,
        COUNT(cfg.id) OVER (PARTITION BY scc.shell_id, scc.charge_id, scc.zone_id) AS cfg_count
    FROM shell_compatible_charges scc
    JOIN shells s ON s.id = scc.shell_id
    JOIN charges c ON c.id = scc.charge_id
    LEFT JOIN zones z ON z.id = scc.zone_id
    LEFT JOIN charge_configurations cfg
        ON cfg.charge_id = scc.charge_id
       AND cfg.zone_id IS NOT DISTINCT FROM scc.zone_id
),
inserted_configs AS (
    INSERT INTO shot_configurations (
        name,
        weapon_model_id,
        shell_id,
        fuze_id,
        primer_id,
        zone_id,
        zone_number,
        max_range_m,
        is_active,
        note
    )
    SELECT DISTINCT
        CONCAT(
            'LEGACY ',
            legacy_pairs.shell_marking,
            ' / ',
            legacy_pairs.charge_marking,
            COALESCE(CONCAT(' / зона ', legacy_pairs.zone_number), '')
        ) AS name,
        legacy_pairs.weapon_model_id,
        legacy_pairs.shell_id,
        NULL::uuid,
        NULL::uuid,
        legacy_pairs.zone_id,
        legacy_pairs.zone_number,
        legacy_pairs.max_range_m,
        false,
        'Автоматично перенесено з legacy shell+charge+zone. Потрібно перевірити підривник і праймер.'
    FROM legacy_pairs
    WHERE legacy_pairs.weapon_model_id IS NOT NULL
      AND legacy_pairs.cfg_count <= 1
    ON CONFLICT (weapon_model_id, name) DO NOTHING
    RETURNING id
)
INSERT INTO shot_configuration_charges (
    shot_configuration_id,
    charge_id,
    accounting_unit,
    quantity_per_shot,
    sort_order
)
SELECT
    sc.id,
    legacy_pairs.charge_id,
    legacy_pairs.accounting_unit,
    legacy_pairs.quantity_per_shot,
    0
FROM legacy_pairs
JOIN shot_configurations sc
  ON sc.weapon_model_id = legacy_pairs.weapon_model_id
 AND sc.shell_id = legacy_pairs.shell_id
 AND sc.zone_number IS NOT DISTINCT FROM legacy_pairs.zone_number
 AND sc.name = CONCAT(
     'LEGACY ',
     legacy_pairs.shell_marking,
     ' / ',
     legacy_pairs.charge_marking,
     COALESCE(CONCAT(' / зона ', legacy_pairs.zone_number), '')
 )
WHERE legacy_pairs.weapon_model_id IS NOT NULL
  AND legacy_pairs.cfg_count <= 1
ON CONFLICT (shot_configuration_id, charge_id) DO UPDATE
SET
    accounting_unit = EXCLUDED.accounting_unit,
    quantity_per_shot = EXCLUDED.quantity_per_shot,
    sort_order = EXCLUDED.sort_order;

UPDATE shot_configurations
SET
    zone_number = z.zone_number,
    is_active = false,
    note = 'Автоматично перенесено з legacy shell+charge+zone. Потрібно перевірити підривник і праймер.'
FROM zones z
WHERE shot_configurations.zone_id = z.id
  AND shot_configurations.name LIKE 'LEGACY %';

UPDATE shot_configurations
SET is_active = false,
    note = 'Автоматично перенесено з legacy shell+charge+zone. Потрібно перевірити підривник і праймер.'
WHERE name LIKE 'LEGACY %'
  AND zone_id IS NULL;

UPDATE shot_configurations
SET name = REPLACE(name, ' / Р В·Р С•Р Р…Р В° ', ' / зона ')
WHERE name LIKE 'LEGACY %';
