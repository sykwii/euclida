# OPS C2 Workspace

Date: 2026-07-14

## Scope

OPS-C2-1 and C2-UX-1 are UI/UX only. They do not change DB schema, backend routes, DTOs, realtime protocol or domain logic.

## Route

- Route: `/c2`
- Existing map, ВГЗ, weapon, fire-position and notification routes remain available.
- Main and mobile navigation include a compact `C2` entry.

## C2-UX-1 Layout

The operator workspace is split into four permanent areas:

- Left 18-20%: operational queue.
- Center 55-60%: embedded live map, dominant visual element.
- Right 20-22%: dense context panel.
- Bottom: operational timeline, collapsed by default, 100-120px.

The map remains mounted in the center and does not disappear when queue/context changes. Queue/context selection does not trigger map reload or map reinitialization.

Responsive behavior:

- 3440x1440: all three columns remain visible.
- 1920x1080: queue/context are narrow and map remains dominant.
- Below 1400px: context becomes a right slide-over.
- Mobile: queue first, map full width, context below as a drawer-like panel.

## Operational Queue

Sections:

- `Нові цілі`
- `Потребують рішення`
- `Активні ВГЗ`
- `Проблеми`

Rules:

- completed and cancelled orders are hidden by default;
- `Показати завершені (N)` toggles completed/cancelled visibility;
- max 5 visible items per section;
- `Ще N` expands a section locally;
- sorting is by severity/priority, then newest;
- row height is compact, 34-42px;
- each row shows only target/order number, short FP/weapon route, time and compact status.

Attention hierarchy:

- red: critical/problem;
- amber: needs action;
- cyan: active mission;
- green: ready/completed;
- gray: neutral.

## Map

The map is the visual center of the workspace:

- minimum 55% workspace width in the main desktop layout;
- existing map controls are preserved;
- large map statistics and active-order side cards are hidden inside `/c2`;
- compact C2 counter strip sits over the map top area:
  - `Нові цілі`
  - `Потребують рішення`
  - `Активні ВГЗ`
  - `Критичні`

## Context Panel

The context panel uses dense stacked sections with 6-8px spacing. Empty sections are hidden.

Target context shows:

- status;
- target/MGRS;
- selected FP;
- selected weapon;
- shot kit summary;
- current execution state;
- execution journal preview;
- actions `Відкрити`, `Почати`, `Підтвердити` where applicable.

Weapon context shows readiness, reason, deployment, FP and active maintenance first.

Fire-position context shows readiness, assigned weapon and aggregate fire readiness first.

Primary actions remain at the bottom and are sticky inside the panel.

## Timeline

Only meaningful operational events are derived for display:

- target received;
- target accepted;
- weapon moved;
- FP ready;
- weapon ready;
- fire started;
- fire completed;
- maintenance started;
- maintenance completed.

C2-UX-1 behavior:

- collapsed by default;
- compact height: 100-120px;
- compact mode shows max 15 events;
- expanded mode can show a larger history slice;
- identical adjacent events are grouped;
- technical map/stock/analytics/reference refreshes are not displayed.

## Realtime

The workspace subscribes to the existing unified `realtime:event` stream through `RealtimeService.watchMany`.

Refresh boundaries:

- `missions` updates reload orders and selected execution journal only.
- `events` operational notification creation reloads unread notifications only.
- `map` updates reload fire positions only.
- `weapons` updates reload weapons only.
- `all` reconnect performs one reconciliation load.
- Unrelated `stock`, `analytics` and `reference` events are ignored by the C2 page.

There is no polling timer.

## Performance

- Standalone Angular component.
- `ChangeDetectionStrategy.OnPush`.
- Stable `trackBy` for queue sections, queue cards, notifications, counters and timeline.
- One initial `forkJoin` load for orders, FPs, weapons and unread notifications.
- Target execution journal is lazy-loaded for the selected target.
- Affected realtime scopes reload only the relevant widget data.
- Selection changes do not call map, FP or weapon reloads.

## Accessibility

- Queue cards and notification cards are buttons.
- Context close button has accessible label.
- Keyboard navigation supports Enter/Escape/Arrow Up/Arrow Down.
- Status text is localized; raw enum values are not shown in the C2 workspace.

## Changed Files

- `frontend/src/app/features/c2-workspace/c2-workspace-page.ts`
- `frontend/src/app/features/c2-workspace/c2-workspace-page.html`
- `frontend/src/app/features/c2-workspace/c2-workspace-page.css`
- `frontend/src/app/features/c2-workspace/c2-workspace-page.spec.ts`
- `docs/stabilization/OPS_C2_WORKSPACE.md`

Earlier OPS-C2-1 also added:

- `frontend/src/app/app.routes.ts`
- `frontend/src/app/app.component.html`

## Verification

Frontend build:

- `npm run build`: passed.
- Existing warning remains: Leaflet CommonJS optimization bailout.

Frontend tests:

- `npm test -- --watch=false`: passed, 9 files / 31 tests.

Focused regressions:

- completed/cancelled orders hidden by default;
- completed visibility toggle works;
- section limit and `Ще N` expansion work;
- queue sorts by priority and newest time;
- selection synchronizes target context and execution journal load without map data reload;
- notification routing opens the corresponding entity in the workspace;
- timeline is collapsed by default;
- compact timeline is limited to 15 events;
- realtime mission event refreshes only the queue/orders widget;
- unrelated stock event does not reload widgets or trigger page rerender.

Static checks:

- no `any` added in C2 workspace code;
- no focused/skipped frontend tests;
- no mojibake in C2 workspace or this document.

## Live UX Smoke

Not executed in a browser session in this pass. The current session did not provide an authenticated busy runtime for `/c2`.

The requested UX expectations are covered by layout code, build and component regressions, but a future manual smoke should still verify:

- map visually dominates on a real busy dataset;
- no large unused black zones at 3440x1440 and 1920x1080;
- selecting target/weapon/FP does not reset map center;
- incoming target appears in the correct section;
- readiness transition updates only the affected queue/context area;
- timeline remains compact.

## Remaining Debt

- The workspace embeds the existing `MapPage`; map internals still own their current overlay controls.
- The C2 page derives timeline items from current API facts. A dedicated backend operational timeline API would make historical event labels more exact later.
- Expanded timeline has not yet grown filters/search because C2-UX-1 focused on rebalancing the operational layout.
