# Release Preflight Route Matrix

## Inventory

| Metric | Result |
| --- | ---: |
| Nest routes | 272 |
| Unauthenticated 401 | 270 |
| Authenticated 500 | 0 |
| Canonical core assertions | 60/60 |
| Active module assertions | 33/33 |

The two non-401 unauthenticated routes are intentional authentication entry
points. Validation-only calls produced controlled 400 responses; unknown
resource IDs produced 404.

## Authenticated Generic Sweep

| Status | Count | Interpretation |
| --- | ---: | --- |
| 200 | 87 | read/update success |
| 201 | 10 | create/transition success |
| 400 | 64 | expected DTO/domain validation for generic body |
| 404 | 111 | expected generated unknown IDs or nonmatching generic path |
| 500 | 0 | no runtime/schema/DI failure |

## Canonical Coverage

| Area | Covered operations | Result |
| --- | --- | --- |
| Auth/users/units | login, hierarchy, scoped users, update | PASS |
| Weapons/FP | create, update, readiness, assignment, block/readiness aggregation, maintenance lifecycle | PASS |
| Ammo/kits | shell, charge, fuze, primer, model, zone, kit composition/activation | PASS |
| Depot/stock | stock add, transfer, lock/post, idempotency | PASS |
| ServiceOrder | create, suggest, select, send, delivery, accept, start, complete | PASS |
| Execution | draft, validate, post, duplicate post, cancel, completion block | PASS |
| Notifications | list/read/realtime delivery and duplicate-source check | PASS |
| Trips | create/update/finish paths | PASS |
| Air threats/assets | create/read/resolve and task paths | PASS |
| Drone logistics | depot stock and air-asset transfer with correct drone depot | PASS |
| EW/recon/settings/analytics | basic create/update/read or active read endpoint | PASS |

## Expected Initial Drone Rejections

Four module calls intentionally used an ammo depot and returned:
`Ресурси БпЛА дозволені тільки на складах БпЛА`.
The same four operations were repeated with the created drone depot and all
returned 201. Effective module result: **33/33**.

## Response Safety

- No response contained SQL text, PostgreSQL constraint names, stack traces,
  password hashes, access tokens, or full internal entity graphs.
- Seven generic scanner flags are false positives in class-validator messages.
- Unknown IDs were controlled 404 responses.
- Domain-invalid payloads were controlled 400 responses.

Raw artifacts:

- `artifacts/route-inventory.json`
- `artifacts/route-generic-smoke.json`
- `artifacts/core-api-smoke.json`
- `artifacts/module-flow-smoke.json`
