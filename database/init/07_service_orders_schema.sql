CREATE TABLE IF NOT EXISTS service_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_number VARCHAR(50) UNIQUE NOT NULL,

    status VARCHAR(50) NOT NULL DEFAULT 'draft',

    target_lat DOUBLE PRECISION NOT NULL,
    target_lng DOUBLE PRECISION NOT NULL,
    target_mgrs VARCHAR(64),
    target_settlement VARCHAR(255),

    task_type VARCHAR(100) NOT NULL,

    planned_resource_a_id UUID,
    planned_resource_b_id UUID,
    planned_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,

    selected_fire_position_id UUID,

    rejection_reason TEXT,

    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    result_type VARCHAR(100),
    result_comment TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_service_orders_resource_a
        FOREIGN KEY (planned_resource_a_id)
        REFERENCES shells(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_service_orders_resource_b
        FOREIGN KEY (planned_resource_b_id)
        REFERENCES charges(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_service_orders_fire_position
        FOREIGN KEY (selected_fire_position_id)
        REFERENCES fire_positions(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_service_orders_status
ON service_orders(status);

CREATE INDEX IF NOT EXISTS idx_service_orders_fire_position
ON service_orders(selected_fire_position_id);

ALTER TABLE service_orders
ADD COLUMN executor_type varchar(30);

ALTER TABLE service_orders
ADD COLUMN selected_air_asset_position_id uuid;

ALTER TABLE service_orders
ADD COLUMN selected_drone_model_id uuid;

ALTER TABLE service_orders
ADD COLUMN selected_warhead_type_id uuid;

ALTER TABLE service_orders
ADD COLUMN linked_air_task_id uuid;