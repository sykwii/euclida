# OPS-3 Order Delivery

## What Changed

- Added persistent `service_order_deliveries` records for hierarchical delivery of one `ServiceOrder`.
- Added division and battery delivery statuses: `new`, `viewed`, `accepted`, `rejected`.
- Added DB-backed inbox endpoints and UI panel `Вхідні цілі`.
- `send` now creates deliveries transactionally and idempotently with `ON CONFLICT DO NOTHING`.
- `start` remains the existing ServiceOrder flow, but if delivery rows exist it requires an accepted battery delivery.

## Schema

- `service_order_deliveries`
  - `service_order_id`, `recipient_unit_id`, `recipient_level`
  - `status`, `delivered_at`, `viewed_at`, `responded_at`, `responded_by_user_id`
  - `rejection_reason`, `comment`, `estimated_ready_at`
  - `selected_fire_position_id`, `selected_weapon_system_id`
  - unique: `(service_order_id, recipient_unit_id, recipient_level)`

Migration: `database/init/46_service_order_deliveries.sql`

The migration is rerunnable and conservatively backfills historical sent/accepted/in-progress/completed/rejected orders from selected fire position unit hierarchy. It does not rewrite `service_orders.status`.

## API

- `GET /service-orders/deliveries`
- `GET /service-orders/deliveries/unread-count`
- `POST /service-orders/deliveries/:deliveryId/view`
- `POST /service-orders/deliveries/:deliveryId/respond`
- `GET /service-orders/:id/deliveries`

Existing ServiceOrder routes and statuses are preserved.

## Delivery Policy

- One ServiceOrder remains the source of truth. Deliveries are per-recipient state, not cloned orders.
- Main sends only after the existing executor selection flow.
- Recipients are derived automatically:
  - battery: selected fire position unit or selected air asset position unit;
  - division: nearest parent unit with `type = 'division'`.
- Retry/send is idempotent because the delivery table has a unique constraint and insert uses `orIgnore`.
- Lower echelons see an order only after a delivery exists.
- Division delivery is independent. Division acceptance/rejection never silently accepts battery delivery.
- Battery acceptance moves the legacy ServiceOrder to `accepted` for compatibility with current execution UI.
- Starting execution requires accepted battery delivery when delivery rows exist. Legacy orders without delivery rows keep the old behavior.

## Scope And Validation

- Delivery responses are restricted to the exact recipient level and unit:
  - division users can respond to their division delivery;
  - battery users can respond to their battery delivery;
  - observers cannot respond.
- Reject requires `rejectionReason`.
- Division cannot select actual FP or weapon.
- Battery-selected FP/weapon must belong to the delivery battery.
- Existing ServiceOrder scope/security remains in place.

## Realtime

- Uses only unified `realtime:event` through `RealtimeEventsService`.
- Delivery and order changes emit scopes `missions` and `events` with `unitId` for recipient filtering.
- No `RealtimeGateway` imports and no named socket emits were added.
- Frontend inbox refreshes through `AutoRefreshService.watch(['missions', 'events'])`; stock/map events do not drive inbox refresh.

## Frontend

- Added compact `Вхідні цілі` panel on the ВГЗ page.
- Sections:
  - `Нові`
  - `Переглянуті`
  - `Опрацьовані`
- Opening a new delivery marks it viewed once.
- Badge count comes from `/service-orders/deliveries/unread-count`, with local update after refresh.
- Battery form can select allowed fire position and weapon; backend remains authoritative.

## Changed Files

- `database/init/46_service_order_deliveries.sql`
- `backend/src/service-orders/service-order-delivery.entity.ts`
- `backend/src/service-orders/dto/respond-service-order-delivery.dto.ts`
- `backend/src/service-orders/service-order.entity.ts`
- `backend/src/service-orders/service-orders.module.ts`
- `backend/src/service-orders/service-orders.controller.ts`
- `backend/src/service-orders/service-orders.service.ts`
- `backend/src/service-orders/service-orders.service.spec.ts`
- `frontend/src/app/features/service-orders/service-orders.service.ts`
- `frontend/src/app/features/service-orders/service-orders-page/service-orders-page.ts`
- `frontend/src/app/features/service-orders/service-orders-page/service-orders-page.html`
- `frontend/src/app/features/service-orders/service-orders-page/service-orders-page.css`

## Verification

- Backend build: passed.
- Backend tests: passed, 8 suites / 31 tests.
- Frontend build: passed.
- Frontend tests: passed, 5 files / 5 tests.
- Grep in changed service-order backend/frontend paths:
  - `RealtimeGateway`: no matches.
  - named socket emits/listeners searched via `_changed`, `event_created`, `all_changed`: no matches.

## Smoke Checklist

- Send creates division and battery deliveries: covered by focused backend smoke.
- Retry creates no duplicate deliveries: enforced by DB unique constraint and `orIgnore`.
- Scope isolation: enforced in `ensureCanRespondToDelivery`.
- Viewed persists: covered by focused backend smoke and persisted `viewed_at`.
- Independent accept/reject forms: implemented per delivery row and level.
- Rejection reason required: covered by focused backend smoke.
- Badge count correct: DB-backed unread-count endpoint and frontend refresh.
- Reconnect/F5 retains inbox: state is DB-backed; realtime only refreshes.
- Main visibility: `GET /service-orders/:id/deliveries` exposes read-only delivery states for visible orders.
- Unrelated stock/map events do not refresh shell inbox: inbox watcher only listens to `missions/events`.

## Remaining Debt

- Dedicated e2e/browser smoke for reconnect and F5 persistence would be useful once the runtime stack is up.
- Current UI panel is embedded in the ВГЗ page; a separate route can be added later without changing the delivery API.
