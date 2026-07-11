# Stock Engine SE-1

Phase 1 adds a parallel canonical stock operation API without breaking legacy routes.

## Rule
All new stock-changing code must call `StockEngineService.execute()`.
Direct repository stock mutation is legacy debt and must be migrated module-by-module.

## Guarantees
- one transaction per business operation;
- unique idempotency key;
- one movement group;
- pessimistic stock row locks;
- no negative balances;
- component balances remain visible by depot;
- movement history remains queryable by resource;
- audit/realtime after commit.

## Resources
shell, charge, fuze, primer, drone, warhead.

## Phase 2
Migrate `StockMovementsService`, Execution Engine and drone logistics to Stock Engine. Remove direct stock repository writes only after smoke coverage.
