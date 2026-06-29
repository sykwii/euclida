CREATE TABLE IF NOT EXISTS depots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,

    depot_type VARCHAR(50) NOT NULL,

    unit_id UUID REFERENCES units(id),

    parent_id UUID REFERENCES depots(id),

    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,

    mgrs VARCHAR(50),

    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS depot_shell_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,

    shell_id UUID NOT NULL REFERENCES shells(id),

    quantity INTEGER NOT NULL DEFAULT 0,

    UNIQUE(depot_id, shell_id)
);
CREATE TABLE IF NOT EXISTS depot_charge_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,

    charge_id UUID NOT NULL REFERENCES charges(id),

    quantity NUMERIC(18,2) NOT NULL DEFAULT 0,

    UNIQUE(depot_id, charge_id)
);
CREATE TABLE IF NOT EXISTS depot_fuze_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,

    fuze_id UUID NOT NULL REFERENCES fuzes(id),

    quantity INTEGER NOT NULL DEFAULT 0,

    UNIQUE(depot_id, fuze_id)
);
CREATE TABLE IF NOT EXISTS depot_primer_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,

    primer_id UUID NOT NULL REFERENCES primers(id),

    quantity INTEGER NOT NULL DEFAULT 0,

    UNIQUE(depot_id, primer_id)
);
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    from_depot_id UUID REFERENCES depots(id),

    to_depot_id UUID REFERENCES depots(id),

    item_type VARCHAR(50) NOT NULL,

    item_id UUID NOT NULL,

    quantity NUMERIC(18,2) NOT NULL,

    movement_datetime TIMESTAMP DEFAULT now(),

    comment TEXT
);