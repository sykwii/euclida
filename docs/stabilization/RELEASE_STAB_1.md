# RELEASE-STAB-1: Core release verification

## Verdict

**PASS**

The primary ServiceOrder workflow is stable after ordered database initialization,
cold application startup, backend/PostgreSQL restarts, socket reconnect, repeated
mutations, and authenticated two-session use.

Test date: 2026-07-28

Branch: `stabilization`

Base commit: `ddcb9a9262c33193c69cf33f15462dbc6fc7ae8f`

Tested tree: base commit plus the focused RELEASE-STAB-1 fixes documented below.

## Environment

| Component | Version |
| --- | --- |
| OS | Windows, PowerShell |
| Node.js | v24.15.0 |
| npm | 11.12.1 |
| Docker | 29.5.2, build 79eb04c |
| Docker Compose | v5.1.3 |
| PostgreSQL | local `euclida-postgres` container |

Build commands:

```text
backend:  npm run build
frontend: npm run build
```

Test commands:

```text
backend:  npm test -- --runInBand
frontend: npm test -- --watch=false
```

## Baseline and final regression

| Check | Result |
| --- | --- |
| Backend production build | PASS |
| Backend full tests | PASS, 16 suites / 106 tests |
| Frontend production build | PASS |
| Frontend full tests | PASS, 11 files / 56 tests |
| Focused or skipped tests | 0 |
| `git diff --check` on release files | PASS |
| Active UI/docs mojibake scan | 1 WeaponSystem fallback found and fixed |

The frontend build retains the existing non-blocking Leaflet CommonJS optimization
warning. The unsafe-type scan found 12 existing `any` uses outside the release
changes; they are listed as non-release-critical debt below.

## Migration verification

Verifier: `scripts/verify-release-migrations.ps1`

The verifier:

1. sorts every `database/init/*.sql` file by filename;
2. applies every script with `ON_ERROR_STOP=1`;
3. reruns the sequence against the current live database;
4. creates a temporary empty database and applies the sequence twice;
5. checks the critical Core entities and columns;
6. compares the live and clean schema summaries;
7. removes only its own prefixed temporary database.

Result:

```text
PASS: 47 init scripts are strict, clean-applicable, and rerunnable.
critical Core schema: PASS on live and temporary databases
live schema objects: 1451
clean schema objects: 1438
missing from live: 47
live only: 60
```

The schema-summary delta is historical drift in non-critical objects. All explicitly
required Core tables and columns pass on both databases:

- shot configurations;
- execution journal and `stock_operation_id`;
- stock operations and stock movements;
- weapon maintenance and archive fields;
- simplified current FirePosition assignment;
- operational notifications;
- ServiceOrder deliveries.

No live database was dropped or truncated.

## Cold start and restart

Startup helper: `scripts/start-release.ps1`

The helper reports occupying PIDs and commands, stops only a confirmed repository
process when requested, starts PostgreSQL/backend/frontend, waits for readiness, and
writes the confirmed listener PIDs to `.release/processes.json`.

Observed:

```text
PostgreSQL ready
backend reachable on the configured API port
frontend GET / = 200
authenticated admin login = PASS
EADDRINUSE = absent
UnknownDependenciesException = absent
missing relation/column error = absent
```

Restart scenarios:

| Scenario | Result |
| --- | --- |
| Backend restart while frontend stays open | PASS |
| PostgreSQL restart while both applications stay open | PASS |
| Backend recovery and authenticated login | PASS |
| Temporary socket disconnect/reconnect | PASS |
| Duplicate realtime notification after reconnect | absent |

## Authenticated Core smoke transcript

All newly prepared records use the `RELEASE-SMOKE-*` prefix.

### Readiness and assignment

1. A combat-ready standalone weapon was returned as an eligible candidate.
2. A combat-ready weapon was assigned immediately to a FirePosition.
3. Derived FirePosition readiness changed to ready in list, card, map, and suggestions.
4. Weapon readiness was changed to not ready with reason `Поломка`.
5. FirePosition became not ready with localized reason `СГ НЕ БГ: Поломка`.
6. Explicit weapon readiness was restored and FirePosition became ready.
7. Weapon was removed and the FirePosition reason became `СГ не призначена`.
8. Explicit FirePosition threat blocking overrode weapon readiness.
9. Clearing the block restored derived readiness.

Result: **PASS**

### Deterministic suggestions

The same authenticated suggestion request was executed 10 times.

```text
candidate count: 9
prepared ready candidates: 2
order identical on all 10 calls: true
blocked candidate reason: fp_blocked
not-ready weapon reason: weapon_not_ready
selected candidate and compatible kit persisted: true
```

Valid candidates were first. Stable ordering, localized reason labels, standalone
candidate handling, kit compatibility, range, component stock, and candidate/kit
persistence passed. No active-flow `zoneId`, legacy assignment, or compatibility-table
dependency was observed.

### Two-session ServiceOrder

Session A used the main/operator scope. Session B used an authorized recipient scope.

```text
draft -> executor suggestion -> candidate -> shot kit -> sent
two required recipients -> two unique deliveries
delivery viewed/accepted in Session B
accepted -> in_progress
Session A received the state change without F5
```

The realtime smoke observed 84 unified events across create, delivery, acceptance,
start, completion, stock, planned-trip, map, and reconnect activity. Reconnect
reconciliation produced the correct final state without duplicate notification.

### Execution, stock, and completion

Final proof order: `176bf5ce-cc79-44a1-a856-cce20f9a04fc`

1. Posted warmup execution with an alternate compatible kit.
2. Posted main execution with actual quantity 2 against planned quantity 1 and a
   mandatory explanation.
3. Repeated post returned the original stock operation.
4. An intentionally excessive draft failed validation with exact component reasons:
   `shell_shortage`, `fuze_shortage`, `primer_shortage`, and `charge_shortage`.
5. Posting the invalid draft was rejected.
6. Completion was rejected while the blocking draft existed.
7. The draft was cancelled, the order completed, and repeated completion remained
   idempotent.

Database proof:

| Record | Status | Quantity | Stock operation | Movement rows | Absolute quantity |
| --- | --- | ---: | --- | ---: | ---: |
| warmup | posted | 1 | one | 4 | 7 |
| main fire | posted | 2 | one | 4 | 14 |
| blocking draft | cancelled | 999999 | none | 0 | 0 |

Order result:

```text
status = completed
planned_quantity = 1
actual_quantity = 3
deliveries = 2
distinct recipients = 2
```

There was no second write-off on repeat post, no partial movement, and no stock
write-off during completion.

### Maintenance and archive

```text
opened -> in_progress -> completed -> explicit combat_ready
stale maintenance rows repaired: 0
referenced weapon DELETE: localized HTTP 409
archive: succeeds
archived item absent from active list: true
historical references readable: true
```

Result: **PASS**

## API operations exercised

The smoke clients use authenticated JSON requests and existing DTOs. No public API
contract was changed.

| Operation | Route family | Relevant payload |
| --- | --- | --- |
| Login | `POST /auth/login` | `login`, `password` |
| Suggestions | ServiceOrder suggestions endpoint | target coordinates, quantity |
| Candidate selection | ServiceOrder selection endpoint | `weaponSystemId`, optional `firePositionId`, kit |
| Send | ServiceOrder send endpoint | existing order/version data |
| Delivery response | delivery view/respond endpoints | delivery id, accepted response |
| Start/complete | ServiceOrder workflow endpoints | existing version/idempotency data |
| Execution | execution draft/validate/post endpoints | type, kit, quantity, comment, idempotency key |
| Readiness | WeaponSystem readiness endpoint | readiness status and localized reason |
| Assignment | FirePosition/WeaponSystem assignment endpoints | canonical current assignment |

Exact backend domain errors were retained and asserted. Backend authority over scope,
state, readiness, stock, and concurrency was not moved to the frontend.

## UI release smoke

Browser checks used authenticated Playwright Chromium after the installed Chrome
control bridge failed to initialize in this environment.

ServiceOrders at 1920x1080 and 3440x1440:

- first, middle, and last visible row menu checked;
- top menu opened below and bottom menu flipped above;
- menu width was 184 px and remained inside the viewport;
- overlay rendered through the root CDK container;
- only one menu remained open;
- scrolling detached the invalid anchor;
- no row shift, clipping, neighboring-row overlap, or horizontal page overflow.

WeaponSystem and FirePosition:

- two adjacent maximum-action cards stayed within their cells;
- visible actions stayed inside card bounds;
- secondary menu stayed within the viewport;
- FirePosition `Дрейк` was derived-ready in API, card, and map;
- the matching map marker was green/ready;
- the sector SVG rendered from the canonical orientation/traverse values;
- no duplicate/stale sector layer was observed.

Result: **PASS**

## Fixed release blockers

1. **Production backend entry point**
   - Reproduction: `npm run start:prod` targeted missing `dist/main.js`.
   - Root cause: Nest emits `dist/src/main.js` in this repository layout.
   - Fix: corrected the production script.

2. **Non-rerunnable and incomplete ordered database initialization**
   - Reproduction: strict clean and live reruns stopped on existing databases,
     missing prerequisite columns, seed constraints, and runtime-only Core columns.
   - Fix: added narrow existence guards, prerequisite columns, corrected impossible
     modular seed quantities, and added `48_release_core_schema_guards.sql`.
   - Regression: automated strict live/clean/double-run verifier.

3. **Suggestion reason label lost**
   - Reproduction: a not-ready candidate returned the code but discarded the exact
     derived localized weapon reason.
   - Fix: evaluator accepts and returns the derived label separately from the stable
     reason code.
   - Regression: evaluator test asserts both exact code and label.

4. **Outdated release smoke clients**
   - Reproduction: clients used legacy selection/acceptance behavior and destructive
     cleanup.
   - Fix: canonical weapon selection, delivery response, execution posting,
     idempotency checks, and non-destructive deactivation.

5. **Active WeaponSystem mojibake**
   - Reproduction: reserve-area fallback rendered a corrupted label.
   - Fix: localized fallback is `РЗ`.

## Cleanup

Cleanup helper: `scripts/cleanup-release-smoke.ps1`

Final cleanup:

```text
active smoke orders cancelled: 0
smoke users deactivated: 3
smoke kits deactivated: 2
weapons/depots archived: 0
historical records preserved: 3
delete/truncate operations: 0
```

## Remaining non-release-critical debt

- The live database contains historical non-Core schema drift relative to a clean
  initialization. Critical release objects match and pass runtime smoke.
- Twelve pre-existing unsafe `any` uses remain in analytics, logistics, EW, planned
  trips, fire missions, and related code outside this release change.
- Leaflet remains a CommonJS dependency and emits an optimization warning.
- The desktop Chrome control bridge failed with `Cannot redefine property: process`;
  local authenticated Playwright Chromium provided the required browser proof.

## Safe next step

Deploy the committed release tree to a staging environment using
`scripts/start-release.ps1`, run `scripts/verify-release-migrations.ps1` against the
staging database, repeat the authenticated smoke once, then promote the same commit.
Do not merge unrelated working-tree changes with the release commit.
