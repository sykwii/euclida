# SE-2 — Legacy stock movements migration

## Goal

Keep existing frontend and HTTP contracts while routing all ammunition
balance mutations through `StockEngineService`.

## Preserved endpoints

- `GET /stock-movements`
- `GET /stock-movements/grouped`
- `POST /stock-movements`
- `POST /stock-movements/batch`

## Preserved behavior

- External supplies are accepted only into `main_pas`.
- Ammunition moves only between ammunition/PAS depot types.
- Existing scope checks remain.
- Legacy movement labels remain:
  - `external_supply`
  - `transfer`
- Responses remain `StockMovement` or `StockMovement[]`.

## Changed internals

`StockMovementsService` no longer:

- locks stock tables directly;
- increments/decrements quantities;
- creates movements directly;
- emits realtime directly.

It delegates mutations to:

```text
StockMovementsService
  -> StockEngineService
  -> StockAdapter
  -> stock table
```

## Integrity improvements

- `stock_operations` is inserted before balance mutation.
- `idempotency_key` protects concurrent retries.
- every `stock_movement` receives `stock_operation_id`;
- one operation produces one `movement_group_id`;
- audit/realtime happen once after commit.

## Remaining migration work

- Execution Engine -> Stock Engine.
- Drone Logistics legacy routes -> Stock Engine.
- ServiceOrders legacy completion -> Stock Engine.
- Add client-supplied idempotency keys to old frontend APIs.
