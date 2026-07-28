# STAGING-VERIFY-RC4

## Verdict

**FAIL: clean schema does not match the FirePosition runtime entity**

Verified release:

- Commit: `0380f630065e6a7c446af8f7993b6e5b79d7fd26`
- Branch: `release/core-v1.0-rc4`
- Tag: `core-v1.0-rc4`
- Worktree: `C:\Users\НЗ\euclida-core-v1-rc4`

The release worktree remained clean. `stash@{0}` (`pre-release-dirty-worktree`)
was not applied, changed, or dropped.

## Environment

| Item | Value |
| --- | --- |
| Host | `DESKTOP-EK0STEO` |
| OS | Windows `10.0.19045` |
| Node.js | `v24.15.0` |
| npm | `11.12.1` |
| Docker | `29.5.2` |
| PostgreSQL | `euclida-postgres`, `postgis/postgis:17-3.5` |
| Staging DB | `euclida_staging_rc1` |
| Backend/frontend | `3100` / `8944` |

Only `euclida_staging_rc1` was recreated. The shared PostgreSQL container was
not restarted and the protected database was not mutated.

## RC4 checks completed

| Check | Result |
| --- | --- |
| Release identity and clean status | PASS |
| First migration pass | PASS, 47/47 |
| Second migration pass | PASS, 47/47 |
| Schema manifest | PASS, 1441 |
| Declared critical columns | PASS, 19/19 |
| Canonical entity-shape transaction probes | PASS, rolled back |
| Backend dependency injection and cold start | PASS |
| Backend production build | PASS |
| Frontend production build | PASS |
| Authenticated login | PASS |
| JWT WebSocket handshake | PASS, WebSocket transport |
| Frontend runtime API/socket target | PASS, only `127.0.0.1:3100` |

Full RC4 logs are preserved in:

`C:\Users\НЗ\euclida-staging-tools\rc4\logs`

## Reproduced blocker

The first public runtime fixture request failed:

```text
POST /fire-positions -> 500
QueryFailedError:
column "ammo_depot_id" of relation "fire_positions" does not exist
```

After adding only that column to the staging schema to narrow the failure, the
same request exposed the next missing runtime column:

```text
POST /fire-positions -> 500
QueryFailedError:
column "main_direction_units" of relation "fire_positions" does not exist
```

The clean RC4 migration set therefore does not produce the table shape required
by `FirePosition`. The incomplete entity-shape probe and 19-column critical
manifest did not exercise an actual TypeORM insert, so both checks produced a
false PASS.

Exact reproduction evidence:

`C:\Users\НЗ\euclida-staging-tools\rc4\logs\rc4-blocker-reproduction.txt`

## Focused correction

The stabilization correction adds the idempotent migration
`49_fire_position_runtime_shape_guard.sql`. It creates:

- `ammo_depot_id` with a `depots(id)` foreign key and `ON DELETE SET NULL`;
- the eight direction, traverse, and sector columns mapped by the entity;
- an index for `ammo_depot_id`.

The release migration verifier now treats all nine columns as critical.

Correction verification:

- all application migrations, including migration 49, applied twice with
  `ON_ERROR_STOP=1` to a separate clean verifier database;
- 47 application scripts passed on each run;
- all nine required FirePosition columns were present;
- migration 49 passed twice against `euclida_staging_rc1`;
- the previously failing authenticated `POST /fire-positions` succeeded and
  returned both a FirePosition ID and generated `ammoDepotId`;
- FirePosition unit tests: 2 suites and 19 tests passed.

## Stopped checks

Per the release rule, the complete verification stopped after reproducing the
new blocker. The following RC4 checks were not claimed:

- full readiness and assignment transitions;
- ten-run deterministic suggestions;
- two-session ServiceOrder workflow;
- execution stock posting and idempotency proof;
- maintenance and archive workflow;
- realtime reconciliation;
- UI smoke and screenshots at both resolutions;
- backend/frontend restart and recovery.

## Cleanup and isolation

Only `STAGING-RC4-*` fixtures were deleted, without `TRUNCATE`. The staging
database, schema, and logs remain available for inspection. Staging backend and
frontend processes were stopped.

Live before/after counts were identical:

| Table | Count |
| --- | ---: |
| `users` | 32 |
| `service_orders` | 49 |
| `service_order_deliveries` | 65 |
| `stock_operations` | 22 |
| `stock_movements` | 143 |
| `weapon_systems` | 2 |
| `fire_positions` | 4 |

The live database contains zero staging-prefixed users and orders. Live ports
remain owned by the expected PIDs: backend `11108`, frontend `21208`.

## Recommendation

Do not promote RC4. Create RC5 from the focused schema correction and repeat the
complete isolated staging verification from a new clean RC5 worktree.
