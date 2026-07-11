# Execution Journal — EA-2

## Scope

This phase adds a parallel append-only execution journal. It does not alter current service-order completion or stock write-off.

## API

- `GET /execution/service-orders/:serviceOrderId`
- `POST /execution/service-orders/:serviceOrderId/records`

## Rules

- Records can be appended only while the service order is `in_progress`.
- Observer is read-only.
- Access is restricted by the service order execution unit.
- `idempotencyKey` prevents duplicate append operations.
- Posted records have no update/delete endpoint.
- Artillery records require a full immutable composition snapshot and at least one charge component.
- No stock balance or service-order status changes occur in EA-2.
- Audit and unified realtime are emitted after the transaction commits.

## Tables

- `execution_records`
- `execution_record_artillery`
- `execution_record_charge_components`
- `execution_corrections` (reserved for a later phase)

## Next phase

EA-3 adds `ExecutionEngine` handlers and transactional resource consumption without moving current legacy completion until smoke verification passes.
