# SE-3 — Drone Logistics through Stock Engine

Preserved:
- all `/drone-logistics/*` routes;
- frontend contracts;
- stock tables;
- `drone_stock_movements` history.

Changed:
- stock mutations are executed by `DroneStockEngineService`;
- depot and air-asset balances are handled by `DroneLocationStockAdapter`;
- every new movement has `movementGroupId`, `stockOperationId`, `idempotencyKey`;
- realtime/audit occur after commit.

Operations:
- external supply -> receipt;
- depot -> air asset -> issue;
- air asset correction -> correction.

Remaining:
- return from air asset to depot UI;
- write-off through Execution Engine;
- client-provided idempotency keys.
