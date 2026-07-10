# API Security Audit

## Scope

R3 backend security and API stabilization audit for:

- controller guard coverage
- scope enforcement
- websocket authentication and delivery filtering
- write-payload validation
- error normalization

Constraints preserved:

- no business logic redesign
- no route changes
- no DB schema changes
- no DTO semantic changes

## Audited controllers

### Authenticated and scope-aware domain controllers

- `analytics.controller.ts`
- `air-assets.controller.ts`
- `air-asset-tasks.controller.ts`
- `air-recon-areas.controller.ts`
- `depots.controller.ts`
- `documents.controller.ts`
- `event-logs.controller.ts`
- `ew.controller.ts`
- `fire-missions.controller.ts`
- `fire-positions.controller.ts`
- `operator-shifts.controller.ts`
- `planned-trips.controller.ts`
- `recommendations.controller.ts`
- `service-orders.controller.ts`
- `stock.controller.ts`
- `stock-movements.controller.ts`
- `weapon-systems.controller.ts`

### Main-scope protected controllers

- `drone-logistics.controller.ts`
- `modules/recon/controllers/recon.controller.ts`
- `fire-position-weapons.controller.ts`
- `depot-shell-stock.controller.ts`
- `depot-charge-stock.controller.ts`
- `depot-fuze-stock.controller.ts`
- `depot-primer-stock.controller.ts`

### Reference and configuration controllers

- `units.controller.ts`
- `settings.controller.ts`
- `air-threats.controller.ts`
- `charges.controller.ts`
- `fuzes.controller.ts`
- `primers.controller.ts`
- `shells.controller.ts`
- `weapon-models.controller.ts`
- `zones.controller.ts`
- `shell-compatible-charges.controller.ts`
- `shell-compatible-fuzes.controller.ts`

### Admin-only controller

- `users.controller.ts`

### Controllers intentionally left without explicit local guards

These are still covered by global guards where applicable:

- `auth.controller.ts` uses `@Public()` for login by design
- `app.controller.ts` is not part of the protected business API surface

## Guard matrix

| Surface | Read auth | Write auth | Elevated restriction |
|---|---|---|---|
| General API | global `JwtAuthGuard` | global `HttpWriteGuard` | n/a |
| Observer write blocking | yes | blocked | `HttpWriteGuard` / `WriteAccessGuard` |
| Admin-only user management | yes | yes | `AdminOnlyGuard` |
| Main-only reference/config writes | yes | yes | `MainScopeGuard` |
| Main-only unscoped modules (`recon`, `drone-logistics`, direct stock tables, fire-position-weapons`) | yes | yes | class-level `MainScopeGuard` |
| Scoped domain modules (`service-orders`, `fire-positions`, `weapon-systems`, `depots`, `planned-trips`, `stock-movements`, `air-assets`, `ew`) | yes | yes | `AccessScopeService` inside services |

## Scope matrix

| Scope | Expected access | Enforced by |
|---|---|---|
| `admin` | full read/write | admin role checks + global write guard |
| `main` operator | full operational read/write except admin-only user management | `MainScopeGuard`, global write guard, service rules |
| `division` operator | scoped read/write for own division subtree | `AccessScopeService.getAllowedUnitIds()` |
| `battery` operator | scoped read/write for own unit only | `AccessScopeService.getAllowedUnitIds()` |
| `observer` | read-only within allowed scope | `HttpWriteGuard` and `WriteAccessGuard` |
| `ew` | own unit scope only | `AccessScopeService.getAllowedUnitIds()` |

## Websocket auth flow

### Handshake

Frontend `RealtimeService` now sends the JWT in Socket.IO `auth.token` on every connection and reconnection.

Backend `RealtimeGateway`:

1. extracts token from `handshake.auth.token`
2. falls back to `Authorization: Bearer ...` or `query.token`
3. verifies JWT with `JwtService`
4. stores `AuthUser` on `socket.data.user`
5. disconnects unauthenticated clients immediately

### Reconnect behavior

- reconnect repeats the same auth callback on the frontend
- backend re-validates JWT on every new socket connection
- auth therefore survives reconnect as long as the token is still valid

### Delivery filtering

Realtime delivery is no longer broadcast blindly to every socket.

Current rules:

- payloads in `users`, `settings`, `reference`, `recon` are delivered only to `admin` or `main`
- payloads with `unitId` are delivered only when `AccessScopeService.canAccessUnit()` returns `true`
- unauthenticated sockets receive nothing because they are disconnected at handshake time

## Validation and error handling

### Added validation coverage

Write endpoints previously using inline or `any` payloads now use validated DTOs for:

- planned routes
- planned trips
- event log mark-read
- service order reject/cancel
- weapon maintenance request/extend

Global `ValidationPipe` now also uses:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `forbidUnknownValues: true`
- `transform: true`

### Error normalization

Added global `ApiExceptionFilter`:

- preserves explicit `HttpException` status codes
- normalizes the JSON error body
- converts PostgreSQL `22P02` to `400 Bad Request` with UUID/parameter format message
- prevents raw unhandled exception leakage

Standard response shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Некоректний UUID або формат параметра",
  "path": "/api/example",
  "timestamp": "2026-07-10T13:00:00.000Z"
}
```

## Vulnerabilities found and fixed

1. Unauthenticated websocket subscription:
   - before: any client could receive `realtime:event`
   - after: JWT required on handshake, invalid socket disconnected

2. Cross-scope realtime broadcast leakage:
   - before: all realtime events were emitted to all connected clients
   - after: gateway filters by `MainScopeGuard` semantics and `unitId` visibility

3. Unscoped high-risk modules:
   - before: `recon`, `drone-logistics`, direct depot stock controllers, and `fire-position-weapons` had no explicit scope restriction
   - after: protected with class-level `MainScopeGuard`

4. Configuration/reference writes not explicitly elevated:
   - before: several reference/config controllers relied only on global write behavior
   - after: write methods now require `MainScopeGuard` plus write access

5. Weak validation on several write endpoints:
   - before: inline object bodies and `any` payloads bypassed DTO validation
   - after: dedicated DTO validation added for the audited write flows

6. Inconsistent error envelopes and raw DB-format errors:
   - before: controller/service errors depended on Nest defaults and DB exceptions
   - after: normalized API error body through global exception filter

## Search results

### Controllers without explicit `@UseGuards`

Post-fix grep result:

```text
backend/src/app.controller.ts
backend/src/auth/auth.controller.ts
```

Interpretation:

- `auth.controller.ts` is intentionally public for login
- `app.controller.ts` is outside the protected business API surface

### Services using `AccessScopeService`

Core scoped services confirmed by grep:

- analytics
- air assets / air recon areas / air asset tasks
- depots
- event logs
- ew
- fire positions
- planned trips
- service orders
- stock
- stock movements
- weapon systems
- realtime gateway delivery filtering

### Services not using `AccessScopeService`

Some services remain intentionally outside per-unit scope and are instead protected by `MainScopeGuard`, notably:

- recon services
- drone logistics service
- direct depot stock services
- reference data services
- units service
- air threats service
- fire-position-weapons service

## Build results

### Backend

- `npm.cmd run build`: passed

### Frontend

- `npm.cmd run build`: passed
- known existing warning: `leaflet` CommonJS / non-ESM warning remains unchanged

## Changed files

### New

- `backend/src/auth/main-scope.guard.ts`
- `backend/src/common/filters/api-exception.filter.ts`
- `backend/src/event-logs/dto/mark-read-event-logs.dto.ts`
- `backend/src/planned-trips/dto/planned-trips.dto.ts`
- `backend/src/service-orders/dto/cancel-service-order.dto.ts`
- `backend/src/service-orders/dto/reject-service-order.dto.ts`
- `backend/src/weapon-systems/dto/extend-maintenance.dto.ts`
- `backend/src/weapon-systems/dto/request-maintenance.dto.ts`

### Updated

- `backend/src/auth/auth.module.ts`
- `backend/src/main.ts`
- `backend/src/realtime/realtime.module.ts`
- `backend/src/realtime/realtime.gateway.ts`
- `backend/src/air-threats/air-threats.controller.ts`
- `backend/src/charges/charges.controller.ts`
- `backend/src/depot-charge-stock/depot-charge-stock.controller.ts`
- `backend/src/depot-fuze-stock/depot-fuze-stock.controller.ts`
- `backend/src/depot-primer-stock/depot-primer-stock.controller.ts`
- `backend/src/depot-shell-stock/depot-shell-stock.controller.ts`
- `backend/src/depots/depots.controller.ts`
- `backend/src/drone-logistics/drone-logistics.controller.ts`
- `backend/src/event-logs/event-logs.controller.ts`
- `backend/src/fire-position-weapons/fire-position-weapons.controller.ts`
- `backend/src/fuzes/fuzes.controller.ts`
- `backend/src/modules/recon/controllers/recon.controller.ts`
- `backend/src/planned-trips/planned-trips.controller.ts`
- `backend/src/primers/primers.controller.ts`
- `backend/src/service-orders/service-orders.controller.ts`
- `backend/src/settings/settings.controller.ts`
- `backend/src/shell-compatible-charges/shell-compatible-charges.controller.ts`
- `backend/src/shell-compatible-fuzes/shell-compatible-fuzes.controller.ts`
- `backend/src/shells/shells.controller.ts`
- `backend/src/stock-movements/stock-movements.controller.ts`
- `backend/src/stock/stock.controller.ts`
- `backend/src/units/units.controller.ts`
- `backend/src/weapon-models/weapon-models.controller.ts`
- `backend/src/weapon-systems/weapon-systems.controller.ts`
- `backend/src/zones/zones.controller.ts`
- `frontend/src/app/core/realtime.service.ts`

## Remaining technical debt

1. Param-level UUID validation is still mixed:
   - many routes still rely on service lookups or DB error translation instead of explicit `ParseUUIDPipe`
   - mitigated by the global exception filter, but not yet uniformly expressed at decorator level

2. Some scoped writes still enforce authorization in services instead of fully declarative guards:
   - this is safe, but the rule distribution is not perfectly uniform

3. Realtime filtering uses payload metadata (`scope`, `entity`, `unitId`):
   - where emitters omit `unitId`, filtering falls back to scope/entity rules
   - unit tagging can still be expanded later for even tighter delivery control

4. `recon` and `drone-logistics` are protected conservatively with `MainScopeGuard` because their data model is not yet unit-scoped:
   - secure now
   - finer-grained division/battery sharing would require a deliberate domain-level access model later
