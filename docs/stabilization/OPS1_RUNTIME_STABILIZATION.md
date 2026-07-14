# OPS-1.1 Runtime Stabilization

## Scope

Stabilized the existing OPS-1 weapon maintenance and deployment workflows without changing public routes, DTO semantics, database schema, or UI layout.

## Maintenance Endpoints

- `POST /weapon-systems/:id/maintenance/open`
- `POST /weapon-systems/:id/maintenance/start`
- `POST /weapon-systems/:id/maintenance/complete`
- `POST /weapon-systems/:id/maintenance/cancel`
- `POST /weapon-systems/:id/readiness/confirm`

Legacy compatibility routes remain available:

- `POST /weapon-systems/:id/maintenance/approve`
- `POST /weapon-systems/:id/maintenance/reject`

## Maintenance State Machine

- `open`: creates one active `WeaponMaintenance` record, sets weapon readiness to `not_combat_ready`, and stores the correct not-ready reason.
- `start`: moves active maintenance to `in_progress`.
- `complete`: closes maintenance as `completed`, records the result, and keeps the weapon `not_combat_ready`.
- `confirm readiness`: explicitly returns the weapon to `combat_ready`; completion does not do this automatically.
- `cancel`: closes active maintenance as `cancelled`.

Only one active maintenance is allowed per weapon. Active maintenance statuses are `opened` and `in_progress`; legacy `pending` and `approved` are still treated as active for compatibility.

## Deployment Endpoints

- `POST /weapon-systems/:id/deployment/assign`
- `POST /weapon-systems/:id/deployment/start-to-fire-position`
- `POST /weapon-systems/:id/deployment/confirm-fire-position-arrival`
- `POST /weapon-systems/:id/deployment/withdraw`
- `POST /weapon-systems/:id/deployment/start-to-reserve`
- `POST /weapon-systems/:id/deployment/confirm-reserve-arrival`
- `POST /weapon-systems/:id/deployment/cancel`

Legacy compatibility routes remain available:

- `POST /weapon-systems/:id/assign-to-fire-position`
- `POST /weapon-systems/:id/move-to-reserve`

## Deployment State Machine

- `assign`: creates a planned `WeaponDeployment` to a fire position. It does not mutate assignment through generic CRUD.
- `start-to-fire-position`: moves planned deployment to `moving`, sets weapon deployment status to `moving_to_fire_position`.
- `confirm-fire-position-arrival`: marks deployment `arrived`, sets weapon deployment status to `at_fire_position`, and sets `currentFirePositionId`.
- `withdraw`: creates a planned deployment back to reserve.
- `start-to-reserve`: moves planned withdrawal to `moving`, sets weapon deployment status to `moving_to_reserve_area`.
- `confirm-reserve-arrival`: marks deployment `arrived`, sets weapon deployment status to `reserve_area`, and clears `currentFirePositionId`.
- `cancel`: cancels a planned or moving deployment.

Duplicate active deployments are rejected. A weapon already at another fire position cannot be reassigned silently. Withdrawal remains blocked when the fire position has an active execution.

## Locking Rules

`lockWeapon()` applies pessimistic locking only to the root `weapon_systems` row. Relations are loaded in a second query inside the same transaction, avoiding PostgreSQL errors from `FOR UPDATE` on nullable outer joins.

Fire-position locking remains a root-row lock on `fire_positions`. Occupancy checks do not join nullable relations.

## Frontend Runtime

- Existing weapon buttons now call the canonical deployment and maintenance routes.
- Assignment and withdrawal create planned deployments first.
- The movement button starts planned movement or confirms arrival depending on current deployment state.
- Maintenance buttons are state-dependent: start, complete, cancel, and explicit readiness confirmation.
- Errors use backend response text when available.
- Refresh remains through unified realtime and the existing local action refresh; no polling or page reload was added.

## Changed Files

- `backend/src/weapon-systems/weapon-systems.controller.ts`
- `backend/src/weapon-systems/weapon-systems.service.ts`
- `backend/src/weapon-systems/weapon-systems.service.spec.ts`
- `backend/src/service-orders/service-orders.service.ts`
- `backend/src/execution/execution-engine.service.ts`
- `frontend/src/app/features/weapon-systems/weapon-systems.service.ts`
- `frontend/src/app/features/weapon-systems/weapon-systems-page/weapon-systems-page.ts`
- `frontend/src/app/features/weapon-systems/weapon-systems-page/weapon-systems-page.html`
- `frontend/src/app/features/weapon-systems/weapon-systems.spec.ts`

## Verification

- Backend focused test: `npm test -- --runInBand weapon-systems.service.spec.ts` passed.
- Backend build: `npm run build` passed.
- Backend full tests: `npm test -- --runInBand` passed.
- Frontend build: `npm run build` passed.
- Frontend tests: `npm test -- --watch=false` passed.
- Lock grep: no nullable relation join is used by `lockWeapon()` under pessimistic write lock.

## Runtime Smoke

Local backend port `3000` was available. Runtime smoke target:

- `POST /weapon-systems/:id/assign-to-fire-position`

Result: unauthenticated smoke returned `HTTP 401`, confirming that the route is reachable and guarded. A mutating end-to-end assignment requires a valid operator JWT plus existing weapon/fire-position identifiers in the local environment; this was covered by backend regression tests rather than writing unknown runtime data.

## Remaining Debt

- Legacy maintenance statuses `pending` and `approved` are still supported as active states for backward compatibility.
- Legacy deployment routes remain as compatibility aliases.
