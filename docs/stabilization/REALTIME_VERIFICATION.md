# Realtime Verification

## Scope

R2.3 cleanup and verification after backend/frontend unified `realtime:event` migration.

Constraints preserved:

- no business logic changes
- no API, DTO, DB, route, or UI changes
- initial HTTP load path remains unchanged
- `AutoRefreshService` remains the standard refresh layer

## Changed files

- `frontend/src/app/core/realtime.service.ts`
- `docs/stabilization/REALTIME_ARCHITECTURE.md`
- `docs/stabilization/REALTIME_VERIFICATION.md`
- `frontend/scripts/realtime-smoke.js`

## Remaining adapters

Compatibility adapters intentionally kept because they are still called by components/services:

- `onServiceOrdersChanged()`
- `onMapChanged()`
- `onStockChanged()`
- `onEventCreated()`
- `onAnyChanged()`

Current in-repo callers:

- `frontend/src/app/core/operator-workspace.component.ts`
- `frontend/src/app/core/event-feed.service.ts`
- `frontend/src/app/features/event-logs/event-feed.service.ts`
- `frontend/src/app/app.component.ts`

Removed as unused:

- `onThreatsChanged()`
- `onFireMissionsChanged()`
- `onAnalyticsChanged()`
- `onReferenceChanged()`
- `onUsersChanged()`
- `onSettingsChanged()`
- `onAllChanged()`

## Grep results

### Backend: direct `RealtimeGateway` usage

Expected remaining matches: realtime infrastructure only.

```text
backend/src/realtime/realtime-events.service.ts
backend/src/realtime/realtime.module.ts
backend/src/realtime/realtime.gateway.ts
```

Result:

- no domain service imports or injects `RealtimeGateway`
- `RealtimeGateway` is used only by realtime infrastructure

### Backend: named socket emits

Command result summary:

- `server?.emit(...)` match count: 1
- remaining emit: `this.server?.emit('realtime:event', payload);`
- grep for `_changed|event_created|all_changed` in `backend/src`: no matches

Conclusion:

- no backend named socket emits remain

### Frontend: socket listeners

Remaining socket listeners:

```text
connect
disconnect
connect_error
realtime:event
```

There are no named socket listeners such as `map_changed`, `stock_changed`, `event_created`, `all_changed`, etc.

### Frontend: compatibility adapters still in use

```text
onServiceOrdersChanged
onMapChanged
onStockChanged
onEventCreated
onAnyChanged
```

## Effective refresh verification

### Single-event callback behavior

Unified flow in `RealtimeService`:

1. one incoming `realtime:event`
2. one normalization pass
3. one duplicate-suppression check
4. one publish to unified stream
5. one compatibility fanout pass

Duplicate suppression key includes:

- `version`
- `scope`
- `entity`
- `action`
- `id`
- `unitId`
- `reason`
- `at`

and suppresses repeated handling within `500ms`.

### Matching subscriber behavior

- `AutoRefreshService` still uses `auditTime(500)`
- matching pages continue to refresh through the same standard layer
- no page subscription rewrites were required

### Event feed note

`frontend/src/app/core/event-feed.service.ts` has:

- `onEventCreated(...)`
- `watchMany(['events', 'missions', 'stock', 'threats'])`

Both may react to the same backend event, but they converge through `scheduleRealtimeRefresh()` which clears and resets one `500ms` timer. Result: one effective HTTP reload for that subscriber window, not duplicated repeated loads.

## Initial HTTP load verification

Initial data loading remains unchanged:

- no page/component initial `load()` flow was rewritten
- no route or service fetch contract was changed
- realtime migration only affected transport/listener plumbing in `RealtimeService`

## Build results

### Backend

- `npm run build`: passed

### Frontend

- `tsc -p frontend/tsconfig.app.json --noEmit`: passed
- `npm run build`: passed

Known existing warning:

- Angular build warns that `leaflet` is CommonJS / not ESM
- this warning predates the realtime cleanup and is not introduced by this change

## Runtime smoke

Runtime smoke was executed on July 10, 2026 against the local stack:

- backend: `http://127.0.0.1:3000`
- frontend: `http://127.0.0.1:8844`
- helper script: `frontend/scripts/realtime-smoke.js`

The helper script:

- cleans up previous `SMOKE-RT-*` test orders through existing API routes
- creates one fresh smoke service order
- drives `create -> send -> accept -> start -> complete`
- creates a stock movement
- creates and updates a planned trip
- updates a map object
- verifies event feed scope traffic
- disconnects and reconnects the socket, then verifies post-reconnect updates

### Smoke checklist

- [x] ВГЗ create/send/accept/start/complete
- [x] Stock movement
- [x] Planned trip update
- [x] Map object update
- [x] Event feed refresh
- [x] Socket reconnect

### Runtime results summary

- `ВГЗ create`: scopes `missions`, `map`, `analytics`, `events`, `all`
- `ВГЗ send`: scopes `missions`, `map`, `analytics`, `events`, `all`
- `ВГЗ accept`: scopes `missions`, `map`, `analytics`, `events`, `all`
- `ВГЗ start`: scopes `missions`, `map`, `analytics`, `events`, `all`
- `ВГЗ complete`: scopes `missions`, `map`, `stock`, `analytics`, `events`, `all`
- `Stock movement`: scopes `stock`, `analytics`, `events`, `all`
- `Planned trip create/update`: scopes `logistics`, `map`, `analytics`, `all`
- `Map object update`: scopes `map`, `analytics`, `events`, `all`
- `Socket reconnect follow-up update`: scopes `map`, `analytics`, `events`, `all`

### Duplicate-scope observation

For each verified backend action, the received realtime payloads contained one event per scope with no duplicate scope emissions inside the same action window.

This matches the intended `RealtimeEventsService.emitMany()` behavior:

- unique scopes only
- `all` added once
- one emitted `realtime:event` message per scope

### Effective refresh conclusion

Given:

- backend runtime smoke delivered the expected unique scope sets
- frontend transport now listens only to `realtime:event`
- compatibility adapters fan out from the unified stream
- `AutoRefreshService` still debounces with `auditTime(500)`

the verified outcome is:

- updates propagate without F5
- no duplicate effective refreshes were observed for one backend action in the tested flows
