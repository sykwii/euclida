# Service Order Completion via Execution Journal

## Summary

SE-5 moves the primary completion path for service orders to the execution journal while preserving API, routes, DTOs, and legacy completion compatibility.

## Completion Rules

When `ServiceOrdersService.complete()` is called:

1. The service loads execution records for the order.
2. If no execution records exist, the legacy completion path remains unchanged.
3. If execution records exist:
   - at least one record must be `posted`;
   - any consumable `draft` record blocks completion;
   - `reversed` records are ignored;
   - `actualQuantity` is recalculated from posted execution records only;
   - the service order is completed without direct stock write-off;
   - fire-position readiness and completion history are updated;
   - realtime and audit are emitted once after commit.

## Stock Ownership

Execution is the single source of ammunition consumption for the journal-backed path.

- `ServiceOrdersService.complete()` does not mutate depot stock in the execution-backed path.
- Legacy stock write-off logic is preserved only for historical orders that do not have execution records.

## Transaction Boundary

The journal-backed completion transaction locks:

- `service_orders`
- selected `fire_positions`

Inside the transaction it updates only order completion fields and fire-position readiness counters.

## Compatibility

Backward compatibility is preserved for:

- existing completion endpoint and DTOs;
- historical service orders without execution journal entries;
- repeated completion of an already completed order within the existing edit window.

## Tests

Covered unit scenarios:

- reject when journal exists but no posted record is present;
- reject when a consumable draft record exists;
- ignore reversed records when calculating actual quantity;
- repeated completion remains idempotent for completed orders;
- legacy completion path still works when no execution journal exists.
