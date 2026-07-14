# OPS Operational Notifications

Date: 2026-07-14

## Goal

Replace generic noisy updates with focused operational alerts. The map operator should see only meaningful operational changes:

- new target/order delivery;
- weapon readiness changed to НЕ БГ or БГ;
- fire-position readiness changed to НЕ БГ or БГ.

Technical refreshes for map, stock, analytics, references, reconnect, and generic CRUD do not create operational notification rows.

## Backend

Added persistent table/entity:

- `operational_notifications`

Runtime-safe schema creation is performed by `OperationalNotificationsService.onModuleInit()` with:

- `CREATE EXTENSION IF NOT EXISTS pgcrypto`;
- `CREATE TABLE IF NOT EXISTS operational_notifications`;
- unique index on `source_event_key`;
- read indexes for recipient user/unit and type/created time.

API:

- `GET /operational-notifications?unread=true`
- `GET /operational-notifications/count`
- `GET /operational-notifications/:id`
- `POST /operational-notifications/:id/read`
- `POST /operational-notifications/:id/acknowledge`
- `POST /operational-notifications/read-all`

Realtime:

- only unified `realtime:event`;
- notification creation emits `scope=events`, `entity=operational_notification`, `action=created`, `id=<notificationId>`, `reason=<type>`;
- read/ack emits `action=updated`;
- unit filtering uses the same `unitId` realtime delivery path as other scoped events.

Sources:

- `ServiceOrderDelivery` creation after `send` commit creates `new_target`;
- weapon readiness transition creates `weapon_not_ready` or `weapon_ready`;
- fire-position readiness transition creates `fire_position_not_ready` or `fire_position_ready`.

Deduplication:

- `sourceEventKey` is unique;
- repeated delivery send/retry does not duplicate;
- unchanged readiness status creates no notification;
- A→B→A creates separate meaningful rows because the source key includes transition time.

## Frontend

Added:

- `OperationalNotificationsService`;
- global `OperationalNotificationOverlayComponent`;
- DB-backed unread badge in the main navigation;
- operational-notification first `Центр повідомлень`.

Overlay behavior:

- top-right global overlay above pages/map;
- maximum 3 visible cards;
- overflow button `Ще N подій`;
- `critical` stays until open/acknowledge;
- `attention` auto-hides after 12 seconds but remains unread in DB;
- `info` auto-hides after 5 seconds;
- listens only for `entity=operational_notification`;
- reconnect performs one reconciliation request;
- stock/map/analytics events do not produce cards.

Center tabs:

- `Нові`;
- `Критичні`;
- `Історія`.

No raw technical event names are shown in the new operational center.

## Changed Files

- `backend/src/operational-notifications/operational-notification.entity.ts`
- `backend/src/operational-notifications/operational-notifications.controller.ts`
- `backend/src/operational-notifications/operational-notifications.module.ts`
- `backend/src/operational-notifications/operational-notifications.service.ts`
- `backend/src/operational-notifications/operational-notifications.service.spec.ts`
- `backend/src/app.module.ts`
- `backend/src/service-orders/service-orders.module.ts`
- `backend/src/service-orders/service-orders.service.ts`
- `backend/src/weapon-systems/weapon-systems.module.ts`
- `backend/src/weapon-systems/weapon-systems.service.ts`
- `backend/src/fire-positions/fire-positions.module.ts`
- `backend/src/fire-positions/fire-positions.service.ts`
- `frontend/src/app/app.component.ts`
- `frontend/src/app/app.component.html`
- `frontend/src/app/features/notifications/operational-notifications.service.ts`
- `frontend/src/app/features/notifications/operational-notification-overlay.component.ts`
- `frontend/src/app/features/notifications/operational-notification-overlay.component.spec.ts`
- `frontend/src/app/features/notifications/notifications-page/notifications-page.ts`
- `frontend/src/app/features/notifications/notifications-page/notifications-page.html`

## Verification

Builds:

- Backend build: passed.
- Frontend build: passed.

Tests:

- Backend tests: passed, 12 suites / 68 tests.
- Frontend tests: passed, 8 files / 17 tests.

Focused regressions:

- delivery creates scoped `new_target` notification;
- duplicate source key creates no duplicate notification;
- weapon БГ→НЕ БГ creates critical notification;
- unchanged НЕ БГ update creates none;
- overlay renders maximum 3 cards and overflow count.

## Live Smoke

Backend ran on `http://localhost:3012`.

HTTP smoke results:

- Created and sent order `907b0b7c-0631-4486-89ea-9dbbc2e8e788`.
- Executor: `air_asset_position`.
- Assigned unit: `f8b0294e-881a-4239-97d4-ddb9446c34aa`.
- Created `new_target` notification: `1923c5c5-f47d-402e-8650-037def706f2d`.
- Set weapon `738e0a9b-65df-4e1a-8fe3-f51d667f1133` to `not_combat_ready`.
- Created critical `weapon_not_ready`: `7afa0611-18fc-4505-8677-b58e9b5c5a6c`.
- Restored the weapon to `combat_ready`.
- Created info `weapon_ready`: `c2a18844-36bf-43f0-96a0-689292f1c51b`.

The smoke verified the persisted DB/API notification path and the unified realtime payload source. A separate visual browser session on the map was not opened in this pass; frontend overlay behavior is covered by the component regression test and build.

## Remaining Debt

- Existing legacy event-feed and operator-push components remain for compatibility. The new operational center is DB-backed and operational-first, but obsolete generic notification UI can be retired later.
- Critical vs attention for `new_target` currently defaults to `attention` because the current `ServiceOrder` model does not expose a canonical priority field.
- Fire-position readiness notifications are wired through explicit readiness transitions; broader generic FP edit flows remain silent unless they use the canonical readiness endpoint.
