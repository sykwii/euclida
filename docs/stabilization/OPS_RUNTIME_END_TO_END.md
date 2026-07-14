# OPS Runtime End-to-End Stabilization

Date: 2026-07-14

## Root Causes Fixed

1. `POST /fire-positions/:id/readiness/not-ready` rejected the current frontend payload `{ notReadyReason }` because `ConfirmFirePositionReadinessDto.readinessStatus` was not optional during validation.
2. `ServiceOrdersService.resolveShotConfiguration()` resolved weapon models from legacy `weapon_systems.fire_position_id/location_type` only. Canonically deployed weapons use `current_fire_position_id + deployment_status='at_fire_position'`, so selecting a fire position failed with `Для ВП не налаштовано модель озброєння`.
3. `ServiceOrdersService.findDeliveryForUpdate()` and delivery acceptance locked rows with nullable joined relations, causing PostgreSQL `FOR UPDATE cannot be applied to the nullable side of an outer join`.
4. Execution draft creation was still blocked by legacy `zoneId`, while AMMO-1 shot kits now use `zoneNumber`. Runtime kits with `zone_id=NULL` could not create execution records from UI.
5. Live DB had `execution_records` but missed EE-2 child tables/columns and current purpose constraint values:
   `execution_record_artillery`, `execution_record_charge_components`, `stock_operation_id`, `posted_at`, `posted_by_user_id`, and `main_fire`.
6. `ExecutionEngineService.post()` locked `ExecutionRecord` and `ServiceOrder` with nullable joined relations, causing the same PostgreSQL `FOR UPDATE` failure during posting.
7. `StockMovement` entity did not declare existing DB columns `accounting_unit` and `stock_operation_id`, so TypeORM dropped those fields when StockEngine saved movements.

## Changed Files

- `backend/src/fire-positions/dto/confirm-fire-position-readiness.dto.ts`
- `backend/src/service-orders/service-orders.service.ts`
- `backend/src/service-orders/service-orders.service.spec.ts`
- `backend/src/execution/dto/create-execution-record.dto.ts`
- `backend/src/execution/execution-record-artillery.entity.ts`
- `backend/src/execution/execution-pipeline-context.type.ts`
- `backend/src/execution/artillery-execution.handler.ts`
- `backend/src/execution/execution-engine.service.ts`
- `backend/src/stock-movements/stock-movement.entity.ts`
- `backend/src/ops-runtime-regressions.spec.ts`
- `backend/scripts/ops-runtime-execution-journal.sql`
- `frontend/src/app/features/service-orders/execution-records.service.ts`
- `frontend/src/app/features/service-orders/execution-record.model.ts`
- `frontend/src/app/features/service-orders/service-orders-page/service-orders-page.ts`

## Actual Routes And Payloads

FP readiness:

- `POST /fire-positions/:id/readiness/not-ready`
  Body: `{ "notReadyReason": "not_prepared" }`
- `POST /fire-positions/:id/readiness/confirm`
  Body: `{}`
- `GET /fire-positions/:id/card`

Order and delivery:

- `POST /service-orders`
- `POST /service-orders/:id/select-position`
  Body: `{ "firePositionId": "...", "shotConfigurationId": "..." }`
- `POST /service-orders/:id/send`
- `GET /service-orders/deliveries`
- `POST /service-orders/deliveries/:deliveryId/respond`
  Body: `{ "status": "accepted", "selectedFirePositionId": "...", "selectedWeaponSystemId": "...", "comment": "OPS-SMOKE accepted" }`
- `POST /service-orders/:id/start`

Execution:

- `POST /execution/service-orders/:serviceOrderId/records`
  Body uses `artillery.compositionSnapshot.zoneNumber`; legacy `zoneId` is optional.
- `GET /execution/records/:id/validate`
- `POST /execution/records/:id/post`
- `POST /service-orders/:id/complete`

## Live Smoke Results

Smoke data prefix: `OPS-SMOKE-*`.

Real IDs:

- Fire position: `f8f0bde4-41ad-48c4-a1b0-70d335925935`
- Weapon: `738e0a9b-65df-4e1a-8fe3-f51d667f1133`
- Shot kit: `dfb531da-99ee-4a89-b1f7-6ea02175b7ce`
- Service order: `729bdfea-31d2-4ba8-9cb2-4ae7991262eb`
- Execution record: `aa174af2-9fc7-4d51-8fac-e9a2a61934ad`
- Stock operation: `1a96c0c6-2f47-4cb5-9688-4ac87762e623`

Observed route results:

- Set FP not ready: success, `readinessStatus=not_combat_ready`, `notReadyReason=not_prepared`.
- Confirm FP ready: success, `readinessStatus=combat_ready`, `notReadyReason=null`.
- FP card: `aggregateReady=true` with assigned weapon resolved from canonical deployment.
- Select FP/shot kit: success after canonical weapon lookup fix.
- Send order: status `sent`.
- Accept battery delivery: status `accepted`.
- Start order: status `in_progress`.
- Create execution draft: status `draft`, `zoneId=null`, `compositionSnapshot.zoneNumber=6`.
- Validate execution: `valid=true`.
- Post execution: status `posted`, `stockOperationId=1a96c0c6-2f47-4cb5-9688-4ac87762e623`.
- Repeat post: returned same posted record and same stock operation.
- Complete order: status `completed`, `actualQuantity=1`.

## DB Proof

Readiness:

- `fire_positions`: `readiness_status='combat_ready'`, `not_ready_reason=NULL`, `unit_id='9488ab64-1174-4dd3-9c33-3208d4f8dc9f'`.
- `weapon_systems`: `readiness_status='combat_ready'`, `deployment_status='at_fire_position'`, `current_fire_position_id='f8f0bde4-41ad-48c4-a1b0-70d335925935'`.

Execution and stock:

- `execution_records`: record `aa174af2-9fc7-4d51-8fac-e9a2a61934ad`, `status='posted'`, `quantity=1`, `stock_operation_id='1a96c0c6-2f47-4cb5-9688-4ac87762e623'`.
- `stock_operations`: exactly one row for idempotency key `execution:aa174af2-9fc7-4d51-8fac-e9a2a61934ad`.
- `stock_movements` for movement group `12643417-1ca6-4c4c-b50f-1c974835de4b`: four rows:
  shell `1`, fuze `1`, primer `1`, charge `4`.
- After order completion, `execution_post` movement count for the smoke comment stayed `4`, so completion did not write off stock a second time.

## Verification

- Backend build: passed.
- Backend tests: `10 passed`, `61 passed`.
- Frontend build: passed. Initial sandbox build failed with `Access is denied`; rerun outside sandbox passed.
- Frontend tests: `7 passed`, `12 passed`.
- Live HTTP smoke: passed on local backend `127.0.0.1:3001` with real JWTs and real DB rows.

## Remaining Debt

- The live smoke movements created before the `StockMovement` entity fix are linked to the operation by `movement_group_id`; their `stock_operation_id` and `accounting_unit` columns remain null. New movements after this code change will persist both fields.
- Some existing backend error strings are mojibake in source files. This task avoided broad text cleanup; UI-facing Ukrainian should be normalized separately.
- The project has no formal TypeORM migration runner; `backend/scripts/ops-runtime-execution-journal.sql` is a rerunnable schema repair script for the proven runtime DB mismatch.
