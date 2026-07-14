# OPS-2 Canonical Firing Workflow

## Scope

OPS-2 builds the firing workflow on top of:
- OPS-1 readiness/deployment
- Execution journal
- StockEngine posting
- canonical shot kits

No hierarchy-notification redesign was introduced.

## Execution Records

`execution_records.purpose` is canonical:
- `barrel_warmup`
- `adjustment`
- `main_fire`
- `additional_fire`
- `other`

Legacy input values remain accepted for compatibility and are normalized:
- `main` -> `main_fire`
- `warmup` -> `barrel_warmup`
- `calibration`, `test` -> `other`

Statuses:
- `draft`
- `posted`
- `reversed`
- `cancelled`

Each artillery record stores an immutable actual composition snapshot in:
- `execution_record_artillery`
- `execution_record_charge_components`

This supports actual composition differing from the planned kit, including mixed modular charges.

## API

Existing routes remain:
- `GET /execution/service-orders/:serviceOrderId`
- `POST /execution/service-orders/:serviceOrderId/records`
- `POST /execution/records/:id/post`

Added routes:
- `GET /execution/records/:id/validate`
- `PATCH /execution/records/:id`
- `POST /execution/records/:id/cancel`

Create writes draft only. Post performs one idempotent StockEngine `write_off` with idempotency key `execution:<recordId>`.

## Pre-Fire Validation

Posting validates:
- ServiceOrder is `in_progress`
- selected fire position is БГ
- selected weapon is БГ
- weapon `deploymentStatus = at_fire_position`
- weapon `currentFirePositionId` matches the selected fire position
- no active maintenance/prohibition
- active/incomplete shot kit rejected for planned/template flow
- target distance is within `maxRangeM`
- fire-position stock is sufficient for shell, every charge component, fuze and primer

Validation returns structured reasons:
- `service_order_not_in_progress`
- `fire_position_missing`
- `fire_position_not_ready`
- `weapon_missing_on_fire_position`
- `weapon_not_ready`
- `weapon_not_on_selected_fire_position`
- `weapon_active_maintenance`
- `shot_kit_not_active_or_incomplete`
- `target_out_of_range`
- `insufficient_stock`

## Quantity And Deviation

`plannedQuantity` is informational.

Actual records may exceed plan if the operator provides a mandatory deviation comment. Actual quantity below plan is allowed; ServiceOrder completion requires a result comment.

Completion:
- requires at least one posted record
- blocks active draft records
- ignores `reversed` and `cancelled`
- sets `actualQuantity` from posted record quantities
- never writes stock
- appends a deviation summary to `resultComment`

## Stock Boundary

Stock mutation happens only through `StockEngineService.execute()` during `POST /execution/records/:id/post`.

ServiceOrder completion no longer performs ammo write-off when execution records exist.

Repeated/concurrent post is idempotent through `execution:<recordId>`.

## Frontend

The active ВГЗ inline details now include a compact execution journal:
- purpose selector
- quantity
- deviation/comment field
- draft creation from selected shot kit
- record list
- `Чернетка / Проведено / Сторновано / Скасовано`
- per-record stock requirement text
- backend rejection reasons after failed post

Manual composition remains supported by backend DTO and can be expanded in UI without changing API.

## Verification

Passed:
- Backend build: `npm run build`
- Backend tests: `npm test -- --runInBand` (8 suites / 27 tests)
- Frontend build: `npm run build`
- Frontend tests: `npm test -- --watch=false` (5 files / 5 tests)

Focused coverage added/updated:
- StockEngine post remains idempotent.
- Draft remains draft when StockEngine rejects.
- Non-artillery post does not mutate stock.
- Structured validation reports `weapon_not_ready`.
- ServiceOrder completion excludes reversed/cancelled records and does not write stock.

Runtime smoke checklist:
- Start accepted ВГЗ.
- Create draft execution record.
- Validate/post record.
- Confirm stock decreases once.
- Repeat post and confirm no second write-off.
- Complete ВГЗ from posted journal.
- Confirm realtime refresh without F5.

## Remaining Debt

- UI currently provides quick draft creation from the selected shot kit; full manual composition editor should be added as a follow-up panel using the same DTO.
- Runtime smoke was represented as a checklist; automated browser smoke can be added when the dev environment is running.
