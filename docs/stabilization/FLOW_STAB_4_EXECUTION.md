# FLOW-STAB-4: Execution, stock posting and completion

## Scope

This change stabilizes only the active ServiceOrder execution path:

`accepted -> in_progress -> execution draft -> validate -> post stock -> completed`

It does not change assignment, suggestions, C2, notifications, map behavior, or
database schema.

## Root causes

1. `ExecutionEngineService.post()` held the execution and ServiceOrder locks in
   one transaction, but called `StockEngineService.execute()`, which opened and
   committed a second transaction. A later failure could therefore leave stock
   posted while the execution record remained a draft.
2. Validation returned `details` and `requirements`, while posting performed its
   own checks. Stock reads were issued once per component and did not share the
   posting transaction.
3. Fire-position validation read the stored FP readiness field instead of the
   canonical operational state derived from the explicit FP block and the
   canonically assigned weapon.
4. Completion checked journal rows before taking the ServiceOrder lock and
   blocked only consumable drafts. A draft created concurrently, or a
   non-artillery active draft, could be missed.
5. The UI treated every draft as "continue" and did not expose draft editing or
   the distinction between validation errors and a postable execution.

## Canonical draft and validation

A draft stores purpose, actual quantity, timestamps, result/comment, and a
snapshot of the selected kit or manual composition. Creating or editing a draft
does not call StockEngine.

The validate endpoint and post command use the same validator. Its response is:

```json
{
  "valid": false,
  "reasons": [
    {
      "code": "shell_shortage",
      "message": "Недостатньо снарядів: потрібно 4, доступно 2",
      "resourceType": "shell",
      "resourceId": "uuid",
      "required": 4,
      "available": 2
    }
  ],
  "consumptionPreview": []
}
```

The validator checks the `in_progress` state, canonical weapon assignment,
derived FP readiness, weapon readiness/model, active maintenance, kit
completeness, range, depot presence, and all composition balances. Shell, fuze,
primer and every charge are calculated from the actual shot quantity and each
charge's `quantityPerShot` and `accountingUnit`.

## Atomic posting

Posting locks only the root `execution_records` and `service_orders` rows with
`pessimistic_write`. Relations are reloaded without nullable relation locks.
Validation is recalculated inside that transaction.

`StockEngineService.executeInTransaction()` uses the same `EntityManager` to:

1. resolve the idempotency key `execution:<recordId>`;
2. lock the depot and affected stock balances;
3. create one `write_off` operation and its movements;
4. decrement every component;
5. mark the execution record `posted`.

Any failure rolls back the operation, movements, balances, and record status
together. A repeated or concurrent post returns the already posted record and
does not create a second stock operation. Audit and realtime publication happen
only after commit.

No new reversal flow was introduced.

## Completion

Completion locks the ServiceOrder and reloads the journal inside the same
transaction. It requires at least one posted, non-reversed record and rejects
every active draft. Cancelled and reversed records do not contribute to totals.
The actual quantity and deviation summary are derived only from posted records.
Completion never mutates stock, and repeated completion does not increment the
FP counter again.

## UI behavior

The expanded ServiceOrder card contains the execution editor and chronological
journal. Planned composition is prefilled; editing an existing draft preserves
its saved actual composition. Rows show purpose, time, status, quantity,
composition, calculated component requirements, and comments.

The contextual primary action is:

- `Додати виконання` when no execution exists;
- `Провести виконання` for a draft without known validation errors;
- `Продовжити виконання` after validation returns blocking reasons;
- `Завершити ВГЗ` after at least one posted record and no active drafts.

Requests are guarded per order/record, successful operations reconcile only the
affected journal, and local editor state is not cleared by stale realtime
responses.

## Verification

- Backend build: `npm run build`
- Backend focused tests: 20 passing
- Backend full suite: 105 passing
- Frontend TypeScript: `tsc -p tsconfig.app.json --noEmit`
- Frontend full suite: 55 passing
- Frontend production build: passed

### Authenticated live smoke

Date: 2026-07-28.

- JWT user: `FLOW-STAB-4-SMOKE`, battery scope.
- ServiceOrder: `d5f12921-6050-4b82-858e-45060b22b6ca` (`1335`).
- ExecutionRecord: `60be02bb-325c-478c-a2c8-65dff5f54830`.
- StockOperation: `108b1d2a-3621-4c4d-a1a2-e10b23690686`.
- Draft DB assertion: `status=draft`, `stock_operation_id=null`, zero
  operations for `execution:<recordId>`.
- Browser primary action issued exactly one validate request and one post
  request. The posted row no longer renders edit/post/cancel controls.
- Two additional authenticated post calls returned the same StockOperation.
- DB assertion: one operation and four movements.
- Balance changes: shell `16 -> 15`, charge `154 -> 150`, fuze `16 -> 15`,
  primer `16 -> 15`.
- Completion through the browser stored `status=completed`,
  `actual_quantity=1`, and `result_type=hit`.
- Post-completion balances and StockOperation count were unchanged.
- Browser layout smoke passed at 1920x1080 and 3440x1440 with no horizontal
  overflow.
