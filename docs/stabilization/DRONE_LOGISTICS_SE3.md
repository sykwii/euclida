# Drone Logistics SE-3

## What changed

SE-3 refactor split drone logistics responsibilities without changing the existing API routes, DTOs, frontend contracts, or database contract beyond the already existing SE-3 migration work.

### Services

- `DroneCatalogService`
  - owns drone model and warhead type catalog reads/creates
  - no stock mutations
- `DroneInventoryService`
  - owns stock and movement read paths
  - no stock mutations
- `DroneTransferService`
  - owns receipt / issue / return / correction / write-off flows
  - routes every mutation through `DroneStockEngineService`
  - returns the same balance row shapes as before
- `DroneLogisticsSchemaService`
  - temporarily keeps `ensureDroneLogisticsSchema()` and DB retry logic
- `DroneLogisticsService`
  - temporary compatibility facade delegating to the split services

## Mutation rules

- No direct stock table mutation remains in:
  - controller
  - compatibility facade
  - catalog service
  - inventory service
- Stock balance mutations are performed only through:
  - `DroneStockEngineService`
  - `DroneLocationStockAdapter`
- Legacy duplicate movement creation and legacy realtime emission paths were removed from drone logistics mutation methods.
- Audit and realtime continue to originate from stock engine after commit.

## Changed files

- `backend/src/drone-logistics/drone-catalog.service.ts`
- `backend/src/drone-logistics/drone-inventory.service.ts`
- `backend/src/drone-logistics/drone-logistics.controller.ts`
- `backend/src/drone-logistics/drone-logistics.module.ts`
- `backend/src/drone-logistics/drone-logistics-schema.service.ts`
- `backend/src/drone-logistics/drone-logistics.service.ts`
- `backend/src/drone-logistics/drone-transfer.service.ts`
- `backend/src/drone-logistics/drone-transfer.service.spec.ts`
- `backend/src/stock-engine/drone-stock-engine.service.spec.ts`
- `docs/stabilization/DRONE_LOGISTICS_SE3.md`

## Verified flows

Covered by focused backend specs:

- add drone to depot -> receipt through stock engine
- depot -> air asset issue
- air asset -> depot return
- correction
- repeated idempotency key returns one existing movement
- insufficient stock path does not emit audit/realtime

## Build and test

- Backend build: passed
- Frontend build: passed
- Focused tests: passed

Frontend build required running outside the sandbox because Angular compiler file access is blocked inside the sandbox.

## Remaining legacy

- `DroneLogisticsService` still exists as a compatibility facade and should be removed only after controllers are allowed to inject split services directly.
- `DroneLogisticsSchemaService` still contains temporary runtime schema bootstrap and retry behavior.
- Return and write-off flows are implemented in `DroneTransferService` for stock-engine routing parity, but current public routes remain unchanged.
