# OPS Operational Notifications

Date: 2026-07-14

## Goal

Replace generic noisy updates with focused operational alerts. The map operator should see only meaningful operational changes:

- new target/order delivery;
- weapon readiness changed to НЕ БГ or БГ;
- fire-position readiness changed to НЕ БГ or БГ.

Technical refreshes for map, stock, analytics, references, reconnect, and generic CRUD do not create operational notification rows.

## Backend

Persistent table/entity:

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

Added/updated:

- `OperationalNotificationsService`;
- global `OperationalNotificationOverlayComponent`;
- DB-backed unread badge in the main navigation;
- operational-notification first `Центр повідомлень`.

OPS-NOTIFY-2 overlay polish:

- fixed top-right overlay above map/pages, responsive full-width on narrow screens;
- compact width `340-380px`, max 3 cards, 8px vertical gap;
- no page scroll impact or layout shift;
- severity-first hierarchy: localized type + time, entity line, concise context, optional action;
- critical cards persist until open/acknowledge;
- attention cards hide after 12 seconds but remain unread in DB;
- info cards hide after 5 seconds and do not reappear after transient expiry in the same session;
- overflow button `Ще N подій`;
- duplicate unread notifications for the same entity/type within 2 seconds stack as `×N`;
- body click opens the action route when present;
- secondary icon-only acknowledge/close has tooltip and does not double-navigate;
- keyboard support: Enter/Space opens, Escape closes only a non-critical transient card;
- OnPush change detection and stable `trackBy`;
- listens only for `entity=operational_notification`;
- reconnect performs one reconciliation request;
- stock/map/analytics events do not produce cards or overlay refreshes.

Notification center polish:

- tabs `Нові | Критичні | Історія`;
- filters `Усі | Цілі | СГ | ВП`;
- dense grouped rows: `Сьогодні / Вчора / Раніше`;
- unread dot, severity marker, title, context, time;
- one-click read/ack;
- `Позначити всі прочитаними`;
- routes to delivery/weapon/fire-position targets.

Content cleanup:

- no raw enums, UUIDs, technical event names or mojibake in notification UI;
- readiness reasons are localized;
- target coordinates show formatted MGRS when present;
- empty payload fields are hidden.

## Changed Files

OPS-NOTIFY-1 backend/API/realtime files:

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

OPS-NOTIFY-2 UI-only files:

- `frontend/src/app/features/notifications/operational-notification-overlay.component.ts`
- `frontend/src/app/features/notifications/operational-notification-overlay.component.spec.ts`
- `frontend/src/app/features/notifications/notifications-page/notifications-page.ts`
- `frontend/src/app/features/notifications/notifications-page/notifications-page.html`
- `frontend/src/app/features/notifications/notifications-page/notifications-page.css`
- `docs/stabilization/OPS_OPERATIONAL_NOTIFICATIONS.md`

## Verification

Builds:

- Backend build for OPS-NOTIFY-1: passed.
- Frontend build after OPS-NOTIFY-2: passed on 2026-07-14.

Tests:

- Backend OPS-NOTIFY-1 tests: passed, 12 suites / 68 tests.
- Frontend OPS-NOTIFY-2 tests: passed, 8 files / 23 tests.
- Focused test scan: no `fit`, `fdescribe`, `xit`, or `xdescribe` in `frontend/src`.

Focused regressions:

- delivery creates scoped `new_target` notification;
- duplicate source key creates no duplicate DB notification;
- weapon БГ→НЕ БГ creates critical notification;
- unchanged НЕ БГ update creates none;
- overlay renders maximum 3 cards and overflow count;
- localized card content avoids raw IDs;
- primary action routes correctly;
- duplicate entity/type events stack as `×N`;
- critical card survives Escape;
- info card hides after timeout;
- unrelated stock/map realtime events are ignored.

## Live Smoke

OPS-NOTIFY-1 HTTP smoke used backend on `http://localhost:3012`:

- Created and sent order `907b0b7c-0631-4486-89ea-9dbbc2e8e788`.
- Executor: `air_asset_position`.
- Assigned unit: `f8b0294e-881a-4239-97d4-ddb9446c34aa`.
- Created `new_target` notification: `1923c5c5-f47d-402e-8650-037def706f2d`.
- Set weapon `738e0a9b-65df-4e1a-8fe3-f51d667f1133` to `not_combat_ready`.
- Created critical `weapon_not_ready`: `7afa0611-18fc-4505-8677-b58e9b5c5a6c`.
- Restored the weapon to `combat_ready`.
- Created info `weapon_ready`: `c2a18844-36bf-43f0-96a0-689292f1c51b`.

OPS-NOTIFY-2 note:

- UI behavior was verified by frontend build and component regressions that simulate the realtime stream and overlay lifecycle.
- A visual two-browser-session smoke was not executed in this pass because no authenticated browser runtime was available in the current session.

## Remaining Debt

- Existing legacy event-feed and operator-push components remain for compatibility. The new operational center is DB-backed and operational-first, but obsolete generic notification UI can be retired later.
- Critical vs attention for `new_target` currently defaults to `attention` because the current `ServiceOrder` model does not expose a canonical priority field.
- Fire-position readiness notifications are wired through explicit readiness transitions; broader generic FP edit flows remain silent unless they use the canonical readiness endpoint.
