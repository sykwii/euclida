CREATE TABLE IF NOT EXISTS weapon_systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    system_type VARCHAR(50) NOT NULL, -- barrel / rocket
    model VARCHAR(255) NOT NULL,
    serial_number VARCHAR(255),
    callsign VARCHAR(255),

    unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    division_id UUID REFERENCES units(id) ON DELETE SET NULL,
    battery_id UUID REFERENCES units(id) ON DELETE SET NULL,
    platoon_id UUID REFERENCES units(id) ON DELETE SET NULL,
    squad_id UUID REFERENCES units(id) ON DELETE SET NULL,

    zones_count INTEGER DEFAULT 0,

    readiness_status VARCHAR(100) DEFAULT 'unknown',
    not_ready_reason TEXT,

    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fire_position_weapons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    fire_position_id UUID NOT NULL REFERENCES fire_positions(id) ON DELETE CASCADE,
    weapon_system_id UUID NOT NULL REFERENCES weapon_systems(id) ON DELETE CASCADE,

    assigned_at TIMESTAMP DEFAULT now(),
    removed_at TIMESTAMP,

    UNIQUE (fire_position_id, weapon_system_id)
);