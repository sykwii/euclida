CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    parent_id UUID REFERENCES units(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fire_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    unit_id UUID REFERENCES units(id) ON DELETE SET NULL,

    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    mgrs VARCHAR(64),

    main_direction VARCHAR(255),
    traverse_limits VARCHAR(255),

    has_sg BOOLEAN DEFAULT false,
    readiness_status VARCHAR(100) DEFAULT 'unknown',
    not_ready_reason TEXT,

    completed_vgz_count INTEGER DEFAULT 0,
    personnel_rotation_status VARCHAR(100),
    air_situation_status VARCHAR(100),

    geom GEOGRAPHY(Point, 4326),

    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);