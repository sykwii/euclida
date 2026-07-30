# RELEASE-PREFLIGHT-ALL

## Verdict

**PASS WITH RESIDUAL RISKS** for the focused stabilization commit
`b033731c7916deb27f099bb4d4387324a5cbc145`.

The audited RC6 identity remains unchanged:

- commit: `df61ba728e1c5398f16c0bdc4048e29870a749bd`
- branch: `release/core-v1.0-rc6`
- tag: `core-v1.0-rc6`
- clean worktree: `C:\Users\НЗ\euclida-core-v1-rc6`

RC6 reproduced clean-schema/runtime blockers. They were collected and fixed on
`codex/release-preflight-fixes`. No RC7 branch or tag was created, no release
branch was moved, and nothing was merged or pushed.

## Environment

| Item | Value |
| --- | --- |
| Host | `DESKTOP-EK0STEO` |
| OS | Windows 10 `10.0.19045` |
| Node / npm | `24.15.0` / `11.12.1` |
| Docker / Compose | `29.5.2` / `5.1.3` |
| PostgreSQL / PostGIS | `17.5` / `3.5.2` |
| NestJS / TypeORM | `11.1.24` / `1.0.0` |
| Staging DB | `euclida_staging_rc1`, UTF-8, owner `euclida_user` |
| Staging ports | backend `3100`, frontend `8944` |

All database writes used `euclida_staging_rc1`. The protected database
`euclida_situation_db` and protected ports `3000/8844` were not targeted.

## Migrations

- RC6 contains 48 application scripts through `50` plus the database bootstrap.
- The focused fix adds `51_release_preflight_schema_contract.sql`.
- Final clean cycle ran 49 application scripts in filename order.
- First pass: **49/49 PASS** with `ON_ERROR_STOP=1`.
- Second pass: **49/49 PASS**.
- Missing relation/column, duplicate constraint/index, partial migration: **0**.
- Logs: `7f0613d-migrations-pass-1.log` and
  `7f0613d-migrations-pass-2.log`.

The final commit differs from the clean-cycle commit only in frontend Leaflet
loading files. Database, backend, migrations, entities, DTOs, and services are
byte-identical for that cycle.

## Runtime Contract

Nest application context bootstrapped successfully:

| Runtime item | Count |
| --- | ---: |
| Modules | 90 |
| Controllers | 41 |
| Provider wrappers | 512 |
| TypeORM entities | 71 |
| Database columns | 858 |
| Duplicate runtime tables | 0 |
| Missing mapped tables | 0 |
| Missing mapped columns | 0 |
| Precision mismatches | 0 |

There are 41 DB-looser nullable differences, six declared-length differences,
and 27 DB-only compatibility/audit columns. None makes the DB stricter than the
canonical insert contract except `item_type varchar(30)` versus an entity
declaration of 50; every active value is shorter than 30 and the full ORM/API
flow passed. Full classification is in
`RELEASE_PREFLIGHT_ENTITY_MATRIX.md`.

## ORM And Queries

- Writable regular entities discovered: **71**.
- Transactional insert/read probes: **71/71 PASS**.
- Blocked dependencies: **0**.
- Owning relation join probes: **42/42 PASS**.
- Update, QueryBuilder update, archive/delete policy: **PASS or intentionally
  skipped where no safe mutable/archive field exists**.
- All probe transactions were rolled back.
- Stock lock/idempotency paths and ServiceOrder relation queries were exercised
  in the end-to-end flow.

Raw matrix:
`C:\Users\НЗ\euclida-staging-tools\preflight-all\artifacts\orm-probe-matrix.json`.

## Routes And Modules

- Nest routes inventoried: **272**.
- Unauthenticated guard result: **270 returned 401**; the remaining two are
  intentionally public authentication endpoints.
- Authenticated HTTP 500 responses: **0**.
- Generic authenticated statuses: 87x200, 10x201, 64x400, 111x404.
- Core canonical API assertions: **60/60 PASS**.
- Active module flow: **33/33 PASS** after using the domain-correct drone depot.
- The four initial drone 400 responses were expected domain validation, not an
  application failure.
- Validation responses did not expose SQL, constraints, stack traces, password
  hashes, or JWT secrets. The generic scanner's seven "leaks" are false
  positives caused by validation text such as `constraints`.

See `RELEASE_PREFLIGHT_ROUTE_MATRIX.md`.

## Domain Proof

- FirePosition readiness is derived from explicit block plus the canonical
  assigned weapon.
- Suggestions returned a stable order on 10 repeated calls.
- A standalone weapon with coordinates and depot became `ready=true`, had one
  compatible kit, and no rejection reasons.
- Full flow passed: create, suggest, select FP/kit, send, deliver, accept, start,
  draft, validate, post, duplicate post, block completion on draft, cancel
  draft, complete, duplicate complete.
- Final order: `4e6dc130-18ad-4dd4-b86f-0d5b31bcd7cc`.
- Warmup/main posted execution each has exactly one `stock_operation` and four
  `stock_movements`.
- Duplicate post returned the original operation ID.
- Completion produced no additional stock write-off.
- Duplicate notification source keys: **0**.

## Realtime

| Check | Result |
| --- | --- |
| Anonymous socket rejected | PASS |
| Authenticated socket accepted | PASS |
| Unified event schema | PASS |
| First-connection duplicates | 0 |
| Reconnect duplicates | 0 |
| Listener multiplication | false |
| Cross-unit sibling events | 0 |

## Frontend

- Production build: **PASS**.
- Test files/tests: **11/11, 57/57 PASS**.
- Shared Leaflet CommonJS resolver is used by home, map, and recon.
- Browser smoke: **PASS** at `1920x1080` and `3440x1440`.
- Routes checked: `/`, `/service-orders`, `/weapon-systems`,
  `/fire-positions`, `/map`.
- Console errors, page errors, HTTP 500, horizontal overflow, mojibake: **0**.
- ServiceOrder menu: root overlay, one instance, below by default, flips above
  at viewport edge, stays in viewport.
- Weapon actions remained inside every adjacent card.

Screenshots:

- `C:\Users\НЗ\.codex\visualizations\2026\07\15\019f64af-28d2-7e13-8145-78b6d8332f5a\preflight-fixed-1920x1080.png`
- `C:\Users\НЗ\.codex\visualizations\2026\07\15\019f64af-28d2-7e13-8145-78b6d8332f5a\preflight-fixed-3440x1440.png`

## Isolation And Cleanup

- Protected listeners remained PID `11108` on 3000 and PID `21208` on 8844.
- No `RELEASE-PREFLIGHT` user/order rows were found in the live database.
- Live `service_orders` changed from 49 to 50 during the multi-day audit while
  the live application remained running. This is concurrent live activity; all
  audit connections and fixture prefixes point to staging.
- Staging nonterminal prefixed orders were cancelled through the API and test
  users were deactivated. Completed/cancelled history was retained.
- `stash@{0}: pre-release-dirty-worktree` remains present and untouched.

## Residual Risks

- `npm audit` previously reported 12 backend advisories (9 high) and 26
  frontend advisories (1 critical). Exploitability was not changed or resolved
  in this schema/runtime stabilization cycle.
- Angular reports Leaflet as CommonJS. Runtime behavior is now covered, but the
  optimization warning remains.
- The automated route fuzzer cannot construct a domain-valid body for every
  parameterized route; release-critical paths are covered by canonical flows.

## Recommendation

The reproduced release blockers are fixed and the preflight is green. Create
RC7 only from `b033731c7916deb27f099bb4d4387324a5cbc145` after reviewing the
dependency advisories. Then run the full release E2E against that exact RC7.
Do not promote RC6 and do not merge automatically.
