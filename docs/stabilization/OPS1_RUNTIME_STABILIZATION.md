# OPS-1 Runtime Stabilization

## Scope

Stabilized the existing OPS-1 weapon maintenance and deployment workflows without changing public routes, DTO semantics, or database schema.

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

The active frontend does not call `assign-to-fire-position`. It uses the canonical planned deployment flow through `/deployment/assign`.

## Fire Position Readiness Endpoints

- `POST /fire-positions/:id/readiness/confirm`
- `POST /fire-positions/:id/readiness/not-ready`

Fire-position readiness is explicit operator state. Weapon arrival, movement start, withdrawal, and deployment cancellation do not automatically make a fire position combat-ready.

Allowed not-ready reasons are `threat`, `damaged`, `not_prepared`, `occupied`, and `other`.

## Deployment State Machine

- `assign`: creates a planned `WeaponDeployment` to a fire position. It does not mutate assignment through generic CRUD.
- `start-to-fire-position`: moves planned deployment to `moving`, sets weapon deployment status to `moving_to_fire_position`.
- `confirm-fire-position-arrival`: marks deployment `arrived`, sets weapon deployment status to `at_fire_position`, and sets `currentFirePositionId`.
- `withdraw`: creates a planned deployment back to reserve.
- `start-to-reserve`: moves planned withdrawal to `moving`, sets weapon deployment status to `moving_to_reserve_area`.
- `confirm-reserve-arrival`: marks deployment `arrived`, sets weapon deployment status to `reserve_area`, and clears `currentFirePositionId`.
- `cancel`: cancels a planned or moving deployment.

Duplicate active deployments are rejected. A weapon already at another fire position cannot be reassigned silently. Withdrawal remains blocked when the fire position has an active execution.

If a target fire position has no `unitId`, assignment derives it from the selected weapon inside the same transaction, but only when:

- the weapon has `unitId`;
- the operator can use the weapon unit;
- the fire position has no currently assigned weapon.

Non-null mismatching fire-position units are rejected and never overwritten silently.

Canonical current location is `weapon_systems.deployment_status + weapon_systems.current_fire_position_id`. `weapon_deployments` stores transition history and uses `from_location_id` / `to_location_id`; it does not have `fire_position_id`.

Legacy `weapon_systems.fire_position_id + location_type` remain read-compatible only. New canonical deployment transitions no longer write those legacy location fields.

## Locking Rules

`lockWeapon()` applies pessimistic locking only to the root `weapon_systems` row. Relations are loaded in a second query inside the same transaction, avoiding PostgreSQL errors from `FOR UPDATE` on nullable outer joins.

Fire-position locking remains a root-row lock on `fire_positions`. Occupancy checks do not join nullable relations.

## Frontend Runtime

- Existing weapon buttons now call the canonical deployment and maintenance routes.
- Assignment and withdrawal create planned deployments first.
- Movement actions are state-specific: assign, start movement, confirm fire-position arrival, withdraw, start reserve movement, confirm reserve arrival, cancel.
- Weapon cards show planned deployments as `Призначено, очікує руху`.
- Fire-position cards show `assignedWeapon` only for `at_fire_position`; planned/moving inbound deployment is shown separately as incoming weapon.
- Maintenance buttons are state-dependent: start, complete, cancel, and explicit readiness confirmation.
- Errors use backend response text when available.
- Refresh remains through unified realtime and the existing local action refresh; no polling or page reload was added.

## Changed Files

- `backend/src/weapon-systems/weapon-systems.controller.ts`
- `backend/src/weapon-systems/weapon-systems.service.ts`
- `backend/src/weapon-systems/weapon-systems.service.spec.ts`
- `backend/src/fire-positions/fire-positions.service.ts`
- `backend/src/service-orders/service-orders.service.ts`
- `backend/src/execution/execution-engine.service.ts`
- `frontend/src/app/features/fire-positions/fire-position.model.ts`
- `frontend/src/app/features/fire-positions/fire-positions-page/fire-positions-page.ts`
- `frontend/src/app/features/fire-positions/fire-positions-page/fire-positions-page.html`
- `frontend/src/app/features/weapon-systems/weapon-systems.service.ts`
- `frontend/src/app/features/weapon-systems/weapon-systems-page/weapon-systems-page.ts`
- `frontend/src/app/features/weapon-systems/weapon-systems-page/weapon-systems-page.html`
- `frontend/src/app/features/weapon-systems/weapon-systems.spec.ts`

## Verification

- Backend focused test: `npm test -- --runInBand weapon-systems.service.spec.ts` passed, including null FP unit derivation, mismatching FP unit rejection, maintenance open, duplicate maintenance rejection, completion staying not combat ready, and explicit readiness confirmation.
- Backend build: `npm run build` passed.
- Backend full tests: `npm test -- --runInBand` passed.
- Frontend build: `npm run build` passed.
- Frontend tests: `npm test -- --watch=false` passed.
- Lock grep: no nullable relation join is used by `lockWeapon()` under pessimistic write lock.
- Frontend route grep: active weapon page calls `/deployment/assign`; legacy `assign-to-fire-position` remains only as deprecated service/controller compatibility.

## Runtime Smoke

Local backend port `3000` was available. Runtime smoke target:

- `POST /weapon-systems/:id/assign-to-fire-position`

Result: unauthenticated smoke returned `HTTP 401`, confirming that the route is reachable and guarded. A mutating end-to-end assignment requires a valid operator JWT plus existing weapon/fire-position identifiers in the local environment; this was covered by backend regression tests rather than writing unknown runtime data.

## Remaining Debt

- Legacy maintenance statuses `pending` and `approved` are still supported as active states for backward compatibility.
- Legacy deployment routes remain as compatibility aliases.
- Fire-position pages now expose incoming deployment state in addition to arrived assignment state.

## OPS-1.3 Fire Readiness Presentation

- Fire-position cards now show FP readiness, current weapon, weapon readiness, deployment state, and aggregated `Готовність до вогню` separately.
- Current weapon remains visible when the FP is `НЕ БГ`; FP readiness no longer implies assignment failure.
- Aggregated readiness is calculated, not stored. It is ready only when FP is combat-ready, an assigned weapon exists, the weapon is combat-ready, the weapon is physically at that FP, and there is no active weapon maintenance.
- Aggregated rejection reasons are localized: `ВП не підготовлена`, `ВП під загрозою`, `СГ не призначена`, `СГ ще в русі`, `СГ НЕ БГ`, `активний ремонт`.
- Raw enum values such as `not_prepared`, `combat_ready`, and `at_fire_position` are mapped to Ukrainian labels in the fire-position UI.
- Explicit FP actions were added: `Підтвердити готовність ВП` and `Позначити ВП НЕ БГ` with reason.
- Readiness changes are transactional, audited through `event_logs`, and emit unified realtime after commit.

OPS-1.3 verification:

- Backend focused test: `npm test -- --runInBand fire-positions.service.spec.ts` passed.
- Backend build: `npm run build` passed.
- Backend full tests: `npm test -- --runInBand` passed: 9 suites / 48 tests.
- Frontend build: `npm run build` passed.
- Frontend tests: `npm test -- --watch=false` passed: 6 files / 8 tests.

## OPS-1.4 Fire Position Scope From Canonical Weapon

- Fire-position scope/readiness resolution now uses an effective unit:
  1. `fire_positions.unit_id`;
  2. canonical arrived weapon unit where `weapon_systems.current_fire_position_id = firePosition.id` and `deployment_status = 'at_fire_position'`;
  3. active incoming deployment weapon unit for planned/moving deployment to that FP;
  4. `null`.
- `fire_positions` still has no `current_weapon_system_id`; canonical current assignment remains `weapon_systems.current_fire_position_id + deployment_status`.
- `GET /fire-positions` resolves assigned/incoming weapon before masking by scope, so a null-unit FP with an arrived canonical weapon is visible to the weapon unit.
- `GET /fire-positions/map` includes null-unit FPs when a canonical arrived weapon or active incoming deployment belongs to the allowed unit, then rechecks effective unit before returning each row.
- `POST /fire-positions/:id/readiness/confirm` locks only the FP root row, resolves the canonical arrived weapon, backfills `fire_positions.unit_id` from that weapon inside the same transaction, and then validates scope.
- Readiness confirmation does not infer unit from planned/incoming deployment. If neither FP nor arrived weapon has a unit, the API returns `Не визначено підрозділ ВП`.
- Legacy `weapon_systems.fire_position_id + location_type` remains readable as fallback, but does not authorize effective-unit readiness resolution.

OPS-1.4 verification:

- Backend focused test: `npm test -- fire-positions.service.spec.ts --runInBand` passed: 12 tests.
- Backend build: `npm run build` passed.
- Backend full tests: `npm test -- --runInBand` passed: 9 suites / 56 tests.
- Frontend build: `npm run build` passed outside sandbox after the sandboxed run hit Windows path access denial.
- Frontend tests: `npm test -- --watch=false` passed outside sandbox: 6 files / 8 tests.

## OPS-1.5 Fire Readiness UI Polish

- Fire-position cards compute `Готовність до вогню` from visible facts, not from a potentially stale server flag:
  - FP readiness is `combat_ready`;
  - assigned weapon exists;
  - weapon deployment is `at_fire_position`;
  - weapon readiness is `combat_ready`;
  - weapon has no active maintenance.
- A card can no longer display `ВП НЕ БГ` together with `Готова до вогню`.
- The readiness action is now a two-state toggle:
  - non-ready FP shows `Позначити ВП БГ` and calls existing `POST /fire-positions/:id/readiness/confirm`;
  - ready FP shows `Позначити ВП НЕ БГ` and calls existing `POST /fire-positions/:id/readiness/not-ready`.
- No schema, DTO, API, or route changes were introduced.
- Fire-position detail aggregation now uses the synchronized fire-position object after assigned weapon resolution.

OPS-1.5 verification:

- Frontend tests: `npm test -- --watch=false` passed outside sandbox: 7 files / 12 tests.
- Frontend build: `npm run build` passed outside sandbox.
- Backend focused test: `npm test -- fire-positions.service.spec.ts --runInBand` passed.
- Backend build: `npm run build` passed.
- Backend full tests: `npm test -- --runInBand` passed: 9 suites / 56 tests.
