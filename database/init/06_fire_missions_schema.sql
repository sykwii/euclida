CREATE TABLE IF NOT EXISTS fire_missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    executing_unit_id UUID REFERENCES units(id),

    fire_position_id UUID REFERENCES fire_positions(id),

    weapon_system_id UUID REFERENCES weapon_systems(id),

    mission_datetime TIMESTAMP NOT NULL,

    target_number VARCHAR(100),

    target_type VARCHAR(255),

    target_lat DOUBLE PRECISION,
    target_lng DOUBLE PRECISION,

    target_mgrs VARCHAR(50),

    target_settlement VARCHAR(255),

    shell_id UUID REFERENCES shells(id),
    shell_quantity INTEGER,

    charge_id UUID REFERENCES charges(id),
    charge_quantity NUMERIC(18,2),

    primer_id UUID REFERENCES primers(id),
    primer_quantity INTEGER,

    fuze_id UUID REFERENCES fuzes(id),
    fuze_quantity INTEGER,

    created_at TIMESTAMP DEFAULT now()
);
ALTER TABLE fire_positions
ADD COLUMN IF NOT EXISTS on_value NUMERIC(10,2);

ALTER TABLE fire_positions
ADD COLUMN IF NOT EXISTS traverse_left NUMERIC(10,2);

ALTER TABLE fire_positions
ADD COLUMN IF NOT EXISTS traverse_right NUMERIC(10,2);
