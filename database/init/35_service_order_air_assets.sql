ALTER TABLE service_orders
ADD COLUMN IF NOT EXISTS executor_type varchar(30),
ADD COLUMN IF NOT EXISTS selected_air_asset_position_id uuid,
ADD COLUMN IF NOT EXISTS selected_drone_model_id uuid,
ADD COLUMN IF NOT EXISTS selected_warhead_type_id uuid,
ADD COLUMN IF NOT EXISTS linked_air_task_id uuid;