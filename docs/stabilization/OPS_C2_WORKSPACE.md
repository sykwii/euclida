# OPS C2 Workspace

Date: 2026-07-14

## Scope

OPS-C2-1 is UI/UX only. It does not change DB schema, backend routes, DTOs, realtime protocol or domain logic.

## Route

- New route: `/c2`
- Existing map, ВГЗ, weapon, fire-position and notification routes remain available.
- Main and mobile navigation include a compact `C2` entry.

## Layout

The operator workspace is split into four permanent areas:

- Left 30%: operational queue.
- Center 45%: embedded live map.
- Right 25%: context panel.
- Bottom: collapsible operational timeline.

The map remains mounted in the center and does not disappear when queue/context changes. Notification cards stay outside the map center.

## Operational Queue

Sections:

- `Нова ціль`
- `Потребує рішення`
- `В роботі`
- `Проблеми`

Each queue card shows:

- priority color;
- target number;
- weapon/fire position;
- time;
- localized status.

Keyboard:

- Arrow Up/Down moves queue focus.
- Enter opens the focused target.
- Esc closes the context panel.

## Context Panel

Target context shows:

- mission status;
- target location;
- assigned FP;
- assigned weapon;
- shot kit;
- execution journal;
- actions `Відкрити`, `Почати`, `Підтвердити` when applicable.

Weapon context shows:

- readiness;
- not-ready reason;
- deployment state;
- current FP;
- maintenance state;
- action `Підтвердити` for readiness where applicable.

Fire-position context shows:

- FP readiness;
- reason;
- assigned weapon;
- aggregate fire readiness;
- action `Підтвердити` for FP readiness where applicable.

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

Technical map/stock/analytics refreshes are not displayed in the C2 timeline.

## Realtime

The workspace subscribes to the existing unified `realtime:event` stream through `RealtimeService.watchMany`.

Refresh boundaries:

- `missions` updates reload orders and selected execution journal only.
- `events` operational notification creation reloads unread notifications only.
- `map` updates reload fire positions only.
- `weapons` updates reload weapons only.
- `all` reconnect performs one reconciliation load.
- Unrelated `stock` events are ignored by the C2 page.

There is no polling timer.

## Performance

- Standalone Angular component.
- `ChangeDetectionStrategy.OnPush`.
- Stable `trackBy` for queue sections, queue cards, notifications and timeline.
- One initial `forkJoin` load for orders, FPs, weapons and unread notifications.
- Target execution journal is lazy-loaded for the selected target.
- Affected realtime scopes reload only the relevant widget data.

## Accessibility

- Queue cards and notification cards are buttons.
- Context close button has accessible label.
- Keyboard navigation supports Enter/Escape/Arrow Up/Arrow Down.
- Status text is localized; raw enum values are not shown in the C2 workspace.

## Changed Files

- `frontend/src/app/app.routes.ts`
- `frontend/src/app/app.component.html`
- `frontend/src/app/features/c2-workspace/c2-workspace-page.ts`
- `frontend/src/app/features/c2-workspace/c2-workspace-page.html`
- `frontend/src/app/features/c2-workspace/c2-workspace-page.css`
- `frontend/src/app/features/c2-workspace/c2-workspace-page.spec.ts`
- `docs/stabilization/OPS_C2_WORKSPACE.md`

## Verification

Frontend build:

- `npm run build`: passed.
- Existing warning remains: Leaflet CommonJS optimization bailout.

Frontend tests:

- `npm test -- --watch=false`: passed, 9 files / 29 tests.

Focused regressions:

- queue sections update from current ВГЗ states;
- timeline includes meaningful start/complete events;
- selection synchronizes target context and execution journal load;
- notification routing opens the corresponding entity in the workspace;
- realtime mission event refreshes only the queue/orders widget;
- unrelated stock event does not reload widgets or trigger page rerender.

## Remaining Debt

- The workspace embeds the existing `MapPage`; map internals still own their current overlay controls.
- The C2 page derives timeline items from current API facts. A dedicated backend operational timeline API would make historical event labels more exact later.
- Visual two-session browser smoke was not executed in this pass; behavior is covered by build and component regressions.
