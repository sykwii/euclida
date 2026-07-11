# Unified Stock Model S0

## Canonical contracts

Canonical stock-engine contracts are defined in:

- `backend/src/stock-engine/contracts/index.ts`

They now own the single canonical definitions for:

- `StockResourceType`
- `StockOperationType`
- `StorageLocationType`
- `StorageLocationRef`
- `StockResourceRef`
- `StockTransactionRequest`

## Temporary aliases

Legacy public entry points remain available through thin aliases:

- `backend/src/stock-engine/stock-resource.types.ts`
- `backend/src/stock-engine/stock-operation.types.ts`
- `backend/src/stock-engine/drone-stock-engine.types.ts`

Compatibility fields that remain temporary:

- `movementType`
- `fromDepotId`
- `toDepotId`

These are normalized inside stock services to canonical `source` / `destination`.

## Refactor coverage

Updated to use the unified model internally:

- `StockEngineService`
- `DroneStockEngineService`
- `DroneLocationStockAdapter`
- `DroneTransferService`
- `ExecutionEngineService`
- `ExecutionConsumptionCalculator`
- `ExecutionPipelineContext`
- `StockMovementsService`

## Remaining legacy

Still intentionally preserved for compatibility:

- stock-engine HTTP DTOs still accept legacy depot fields;
- stock movement compatibility layer still maps old DTO shape into canonical requests;
- `movementType` still exists for legacy stock/drone movement records and audit labeling;
- stock adapters continue using existing stock tables and movement entities unchanged.
