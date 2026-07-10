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
- `docs/stabilization/REALTIME_ARCHITECTURE.md`

## Notes

- Named socket emits such as `*_changed`, `event_created`, and `all_changed` are removed from backend transport.
- Frontend was not modified in this refactor.
