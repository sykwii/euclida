# OPS-1 Readiness And Deployment

## Scope

OPS-1 canonicalizes weapon readiness and deployment without changing public route names or historical reads.

Changed areas:
- `backend/src/weapon-systems`
- `backend/src/fire-positions`
- `backend/src/service-orders/service-order-suggestions.service.ts`
- `backend/src/service-orders/service-orders.service.ts`
- `frontend/src/app/features/weapon-systems`
- `frontend/src/app/features/fire-positions`
- `database/init/44_ops1_readiness_deployment.sql`

## Canonical Model

Weapon readiness is independent from location:
- `readinessStatus`: `combat_ready | not_combat_ready`
- `notReadyReason`: `breakdown | threat | crew | maintenance | other | null`
- `deploymentStatus`: `reserve_area | moving_to_fire_position | at_fire_position | moving_to_reserve_area`
- `currentFirePositionId`: nullable current arrived fire position

Fire position readiness is independent from weapon readiness:
- `readinessStatus`: `combat_ready | not_combat_ready`
- `notReadyReason`: `threat | damaged | not_prepared | occupied | other | null`

Legacy fields remain readable:
- `weapon_systems.location_type`
- `weapon_systems.fire_position_id`
- legacy weapon maintenance columns

## Migration

`44_ops1_readiness_deployment.sql` is rerunnable and non-destructive.

It adds:
- `weapon_systems.deployment_status`
- `weapon_systems.current_fire_position_id`
- `weapon_maintenances`
- `weapon_deployments`
- active occupancy unique index on `current_fire_position_id`

It backfills:
- legacy weapon readiness into canonical values
- legacy fire position readiness into canonical values
- legacy `fire_position_id/location_type` into `current_fire_position_id/deployment_status`
- historical arrived deployment rows for existing assignments
- maintenance history rows from legacy maintenance columns

## Transition Rules

Generic weapon CRUD no longer performs deployment/location changes. Movement is done through dedicated actions.

Deployment actions:
- assign/plan move to fire position
- start move to fire position
- confirm fire position arrival
- withdraw/plan move to reserve
- start move to reserve
- confirm reserve arrival
- cancel planned or moving deployment

Safety rules enforced:
- one weapon cannot occupy two fire positions
- duplicate fire position occupancy is rejected
- `at_fire_position` requires `currentFirePositionId`
- weapon cannot execute while in reserve or moving
- withdrawal is blocked while the fire position has active execution
- assigning a not combat ready weapon requires explicit confirmation
- arrival does not change readiness

## Maintenance

`WeaponMaintenance` stores repair/maintenance history.

Opening repair/maintenance:
- creates maintenance row
- sets weapon to `not_combat_ready`
- uses `breakdown` or `maintenance` reason

Completing maintenance:
- marks maintenance completed
- does not auto-confirm `combat_ready`
- operator must explicitly confirm readiness

## Service Orders

Execution/start now checks that selected fire position has an assigned weapon that is:
- `deploymentStatus = at_fire_position`
- `readinessStatus = combat_ready`

Service order start/cancel/complete no longer rewrites fire position readiness. Completion still updates `completedVgzCount`.

## Frontend

Weapon cards now show two separate badges:
- БГ / НЕ БГ with reason
- РЗ / рух до ВП / на ВП / рух до РЗ

Fire position cards show:
- fire position readiness badge
- assigned weapon readiness badge
- assigned weapon deployment badge

Weapon edit form edits weapon identity/readiness only. Assignment and withdrawal are state-dependent actions.

## Verification

Builds and tests:
- Backend build: passed (`npm run build`)
- Backend tests: passed (`npm test -- --runInBand`, 8 suites / 26 tests)
- Frontend build: passed (`npm run build`)
- Frontend tests: passed (`npm test -- --watch=false`, 5 files / 5 tests)

Focused OPS-1 tests added:
- not combat ready assignment requires confirmation
- duplicate occupancy is rejected
- active execution blocks withdrawal
- maintenance completion does not auto-confirm БГ

Search checks:
- No `any` added in OPS-1 touched files.
- No direct `RealtimeGateway` or named socket usage added in OPS-1 touched files.

## Remaining Debt

- Legacy `location_type/fire_position_id` remain mirrored for compatibility and should be removed in a later cleanup migration.
- Legacy maintenance columns remain for compatibility and historical reads.
- Some older UI text outside OPS-1 touched areas still contains mojibake and should be cleaned in a separate UI text pass.
- `startDeployment` still supports direct start compatibility. A later cleanup can simplify that branch after all callers use explicit plan/start/confirm actions.
