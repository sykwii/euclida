CREATE TABLE IF NOT EXISTS shells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    system_type VARCHAR(50) NOT NULL,
    damage_type VARCHAR(100) NOT NULL,

    marking VARCHAR(100) NOT NULL UNIQUE,

    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    marking VARCHAR(100) NOT NULL UNIQUE,

    packaging_type VARCHAR(50) NOT NULL,

    measurement_unit VARCHAR(50) DEFAULT 'шт',

    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fuzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    marking VARCHAR(100) NOT NULL UNIQUE,

    material VARCHAR(100),

    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS primers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    marking VARCHAR(100) NOT NULL UNIQUE,

    ammo_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shell_compatible_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    shell_id UUID NOT NULL REFERENCES shells(id) ON DELETE CASCADE,

    charge_id UUID NOT NULL REFERENCES charges(id) ON DELETE CASCADE,

    max_range_m INTEGER NOT NULL,

    created_at TIMESTAMP DEFAULT now(),

    CONSTRAINT uq_shell_charge
        UNIQUE(shell_id, charge_id)
);
CREATE TABLE IF NOT EXISTS shell_compatible_fuzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    shell_id UUID NOT NULL REFERENCES shells(id) ON DELETE CASCADE,

    fuze_id UUID NOT NULL REFERENCES fuzes(id) ON DELETE CASCADE,

    created_at TIMESTAMP DEFAULT now(),

    CONSTRAINT uq_shell_fuze
        UNIQUE(shell_id, fuze_id)
);
CREATE TABLE IF NOT EXISTS zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    weapon_model VARCHAR(255) NOT NULL,

    zone_number INTEGER NOT NULL,

    distance_from_m INTEGER NOT NULL,

    distance_to_m INTEGER NOT NULL,

    created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS weapon_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL UNIQUE,

    system_type VARCHAR(50) NOT NULL,

    zones_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT now()
);
