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

## Smoke checklist

Static verification completed. Runtime smoke should be checked in-app:

- [ ] ВГЗ create/send/accept/start/complete
- [ ] Stock movement
- [ ] Planned trip update
- [ ] Map object update
- [ ] Event feed refresh
- [ ] Socket reconnect

Expected result for each:

- updates appear without F5
- no duplicate reloads for one backend event
