# Shot Configuration Architecture

## Scope

This change adds a canonical `ShotConfiguration` model for ВГЗ without removing legacy ammo fields, routes, or historical data.

## Schema

Migration: `database/init/40_shot_configurations.sql`

Created:

- `shot_configurations`
- `shot_configuration_charges`
- `service_order_actual_shot_configurations`
- `service_order_actual_shot_configuration_charges`

Updated:

- `service_orders.selected_shot_configuration_id`
- `service_orders.actual_shot_configuration_snapshot`

Legacy tables remain in place:

- `charge_configurations`
- `service_order_actual_ammo`
- existing `selected_shell_id / selected_charge_id / selected_zone_id`

## Canonical model

`ShotConfiguration` = weapon model + shell + fuze + primer + zone + max range + ordered charge components.

Each charge component stores:

- `charge_id`
- `quantity_per_shot`
- `sort_order`

Charge accounting is normalized in services as:

- `piece` for legacy/unit charges
- `module` for modular charges

## Rules

- A configuration belongs to one weapon model.
- Zone must belong to the same weapon model.
- At least one charge component is required.
- Duplicate charges inside one configuration are rejected.
- `quantity_per_shot` must be a positive integer.
- No client-side range or stock calculation is trusted.

## Legacy mapping

Compatibility is preserved in two ways:

1. Legacy `shellId + chargeId + zoneId` can still be sent to selection/completion endpoints.
2. Backend resolves that tuple into a canonical configuration when the match is unambiguous.

Automatic migration converts only unambiguous legacy combinations from `shell_compatible_charges` plus `charge_configurations`.

Not migrated automatically:

- combinations without a resolvable weapon model
- ambiguous legacy `shell + charge + zone` matches

Those records are intentionally left in legacy structures and must be reviewed manually. The migration does not guess fuze/primer values.

## Suggestions and availability

ВГЗ suggestions now prefer `shotConfigurationId`.

Filtering:

- same weapon model as the selected fire position
- target distance `<= max_range_m`
- complete stock availability

Available complete shots are calculated as the minimum whole set across:

- shells
- fuzes
- primers
- every charge component

## Completion and write-off

Transaction boundaries:

1. lock service order row
2. lock relevant stock rows
3. revalidate configuration and quantities
4. restore previous completion state on edit
5. deduct shell/fuze/primer/charge components
6. save immutable snapshot
7. write grouped stock movements
8. commit
9. emit audit/realtime after commit

This prevents concurrent double write-off.

## Snapshot strategy

Current completed configuration is stored in:

- `service_orders.actual_shot_configuration_snapshot`
- `service_order_actual_shot_configurations`
- `service_order_actual_shot_configuration_charges`

Legacy completed rows stay readable through `service_order_actual_ammo`.

## Changed files

Backend:

- `backend/src/shot-configurations/*`
- `backend/src/service-orders/service-order.entity.ts`
- `backend/src/service-orders/service-order-actual-shot-configuration*.ts`
- `backend/src/service-orders/dto/complete-service-order.dto.ts`
- `backend/src/service-orders/service-order-suggestions.service.ts`
- `backend/src/service-orders/service-orders.service.ts`
- `backend/src/service-orders/service-orders.controller.ts`
- `backend/src/service-orders/service-orders.module.ts`
- `backend/src/app.module.ts`
- `database/init/40_shot_configurations.sql`

Frontend:

- `frontend/src/app/features/shot-configurations/*`
- `frontend/src/app/features/service-orders/service-order.model.ts`
- `frontend/src/app/features/service-orders/service-orders.service.ts`
- `frontend/src/app/features/service-orders/service-orders-page/*`
- `frontend/src/app/app.routes.ts`

## Verification

Completed:

- backend build
- frontend build

Manual/automated test debt still remaining:

- dedicated backend tests for mixed modular compositions
- dedicated backend tests for concurrent completion races
- dedicated frontend interaction tests for the new CRUD page

## Remaining debt

- sidebar navigation entry was kept minimal; command palette indexing was not extended
- legacy completion form still posts old ammo fields for compatibility, while backend derives canonical write-off from configuration when available
- legacy migrated configurations may remain inactive until operator confirms missing fuze/primer data
