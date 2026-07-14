CREATE TABLE IF NOT EXISTS service_order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  recipient_unit_id uuid NOT NULL REFERENCES units(id),
  recipient_level varchar(20) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'new',
  delivered_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz NULL,
  responded_at timestamptz NULL,
  responded_by_user_id uuid NULL,
  rejection_reason text NULL,
  comment text NULL,
  estimated_ready_at timestamptz NULL,
  selected_fire_position_id uuid NULL REFERENCES fire_positions(id),
  selected_weapon_system_id uuid NULL REFERENCES weapon_systems(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_service_order_delivery_level CHECK (recipient_level IN ('division', 'battery')),
  CONSTRAINT chk_service_order_delivery_status CHECK (status IN ('new', 'viewed', 'accepted', 'rejected')),
  CONSTRAINT uq_service_order_delivery_recipient UNIQUE (service_order_id, recipient_unit_id, recipient_level)
);

CREATE INDEX IF NOT EXISTS idx_service_order_deliveries_order
  ON service_order_deliveries(service_order_id);

CREATE INDEX IF NOT EXISTS idx_service_order_deliveries_recipient_status
  ON service_order_deliveries(recipient_unit_id, recipient_level, status);

CREATE INDEX IF NOT EXISTS idx_service_order_deliveries_delivered_at
  ON service_order_deliveries(delivered_at);

INSERT INTO service_order_deliveries (
  service_order_id,
  recipient_unit_id,
  recipient_level,
  status,
  delivered_at,
  viewed_at,
  responded_at,
  responded_by_user_id,
  selected_fire_position_id
)
SELECT
  so.id,
  fp.unit_id,
  'battery',
  CASE
    WHEN so.status IN ('accepted', 'in_progress', 'completed') THEN 'accepted'
    WHEN so.status = 'rejected' THEN 'rejected'
    ELSE 'new'
  END,
  COALESCE(so.updated_at, so.created_at, now()),
  CASE WHEN so.status IN ('accepted', 'in_progress', 'completed', 'rejected') THEN COALESCE(so.updated_at, now()) ELSE NULL END,
  CASE WHEN so.status IN ('accepted', 'in_progress', 'completed', 'rejected') THEN COALESCE(so.updated_at, now()) ELSE NULL END,
  so.accepted_by_user_id,
  so.selected_fire_position_id
FROM service_orders so
JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
WHERE so.status IN ('sent', 'sent_to_division', 'sent_to_battery', 'accepted', 'in_progress', 'completed', 'rejected')
  AND fp.unit_id IS NOT NULL
ON CONFLICT ON CONSTRAINT uq_service_order_delivery_recipient DO NOTHING;

INSERT INTO service_order_deliveries (
  service_order_id,
  recipient_unit_id,
  recipient_level,
  status,
  delivered_at,
  viewed_at
)
SELECT
  so.id,
  division.id,
  'division',
  CASE
    WHEN so.status IN ('accepted', 'in_progress', 'completed') THEN 'viewed'
    WHEN so.status = 'rejected' THEN 'viewed'
    ELSE 'new'
  END,
  COALESCE(so.updated_at, so.created_at, now()),
  CASE WHEN so.status IN ('accepted', 'in_progress', 'completed', 'rejected') THEN COALESCE(so.updated_at, now()) ELSE NULL END
FROM service_orders so
JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
JOIN units battery ON battery.id = fp.unit_id
JOIN units division ON division.id = battery.parent_id
WHERE so.status IN ('sent', 'sent_to_division', 'sent_to_battery', 'accepted', 'in_progress', 'completed', 'rejected')
  AND division.type = 'division'
ON CONFLICT ON CONSTRAINT uq_service_order_delivery_recipient DO NOTHING;
