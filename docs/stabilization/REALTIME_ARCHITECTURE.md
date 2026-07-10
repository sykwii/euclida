# Realtime Architecture

## Goal

Backend realtime is now transport-isolated:

- domain services do not import or inject `RealtimeGateway`
- only `RealtimeEventsService` may use `RealtimeGateway`
- backend emits only one socket event name: `realtime:event`

This refactor preserves existing domain scopes, entities, actions, reasons, routes, DTOs, DB schema, and frontend behavior.

## Protocol

Socket event name:

- `realtime:event`

Unified payload:

```json
{
  "version": 1,
  "scope": "map",
  "entity": "service_order",
  "action": "updated",
  "id": "uuid",
  "unitId": "uuid",
  "reason": "service_order_updated",
  "at": "2026-07-10T09:00:00.000Z"
}
```

Fields:

- `version`: protocol version, currently always `1`
- `scope`: logical channel (`missions`, `map`, `analytics`, `events`, `stock`, `reference`, `users`, `settings`, `weapons`, `recon`, `threats`, `logistics`, `all`)
- `entity`: domain entity name
- `action`: domain action
- `id`: optional entity id
- `unitId`: optional unit id
- `reason`: preserved semantic reason
- `at`: ISO timestamp

## Backend roles

### RealtimeGateway

Transport only:

- owns Socket.IO gateway setup
- validates CORS origins
- emits only `realtime:event`
- does not know domain-level fanout rules

### RealtimeEventsService

Single backend publisher:

- constructs unified payloads
- adds `version`
- emits one message per scope
- `emitMany()` deduplicates scopes
- `emitMany()` always includes `all` exactly once
- uses one shared timestamp for the whole fanout batch

## Frontend lifecycle

Frontend `RealtimeService` listens only to:

- `connect`
- `disconnect`
- `connect_error`
- `realtime:event`

There are no named socket listeners on the frontend transport anymore.

### Incoming event flow

1. socket receives `realtime:event`
2. payload is normalized to the unified protocol
3. duplicate handling suppresses repeated processing of the same incoming event
4. unified stream is published to internal watchers
5. compatibility adapters route the event to legacy public callbacks

### Reconnect behavior

After a real disconnect, the next successful reconnect publishes one local synthetic event:

```json
{
  "version": 1,
  "scope": "all",
  "entity": "system",
  "action": "changed",
  "reason": "reconnect",
  "at": "2026-07-10T09:00:00.000Z"
}
```

This is frontend-local and does not require backend changes.

### Compatibility adapters

Legacy public methods remain available and are derived from the unified stream:

- `onThreatsChanged()` -> `scope === 'threats'`
- `onServiceOrdersChanged()` -> `scope === 'missions' && entity === 'service_order'`
- `onFireMissionsChanged()` -> `scope === 'missions' && entity === 'fire_mission'`
- `onMapChanged()` -> `scope === 'map'`
- `onStockChanged()` -> `scope === 'stock'`
- `onEventCreated()` -> `scope === 'events'`
- `onAnalyticsChanged()` -> `scope === 'analytics'`
- `onReferenceChanged()` -> `scope === 'reference'`
- `onUsersChanged()` -> `scope === 'users'`
- `onSettingsChanged()` -> `scope === 'settings'`
- `onAllChanged()` -> `scope === 'all'`
- `onAnyChanged()` -> derived from the unified stream through compatibility event-name mapping

`AutoRefreshService` remains the standard page refresh layer and preserves the existing `500ms` debounce.

## Fanout rules

Use:

- `emit(scope, action, options)` for a single scope
- `emitMany(scopes, action, options)` for domain fanout

`emitMany()` behavior:

1. deduplicate requested scopes
2. append `all` once
3. emit exactly one `realtime:event` per resulting scope

## Removed transport coupling

Direct `RealtimeGateway` imports/injections were removed from:

- `backend/src/service-orders/service-orders.service.ts`
- `backend/src/fire-missions/fire-missions.service.ts`
- `backend/src/weapon-systems/weapon-systems.service.ts`

## Changed files

- `backend/src/realtime/realtime.gateway.ts`
- `backend/src/realtime/realtime-events.service.ts`
- `backend/src/realtime/realtime.types.ts`
- `backend/src/service-orders/service-orders.service.ts`
- `backend/src/fire-missions/fire-missions.service.ts`
- `backend/src/weapon-systems/weapon-systems.service.ts`
- `frontend/src/app/core/realtime.service.ts`
- `docs/stabilization/REALTIME_ARCHITECTURE.md`

## Notes

- Named socket emits such as `*_changed`, `event_created`, and `all_changed` are removed from backend transport.
- Frontend uses compatibility adapters so existing page subscriptions can remain unchanged.
