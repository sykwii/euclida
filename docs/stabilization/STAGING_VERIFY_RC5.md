# STAGING-VERIFY-RC5

## Verdict

**FAIL: clean schema does not match the ExecutionRecord runtime entity**

Verified release:

- Commit: `949eb601d83a7c353fadeeeff0a67b8b418c4832`
- Branch: `release/core-v1.0-rc5`
- Tag: `core-v1.0-rc5`
- Worktree: `C:\Users\НЗ\euclida-core-v1-rc5`

The RC5 worktree remained clean. `stash@{0}`
(`pre-release-dirty-worktree`) was not applied, changed, or dropped.

## Environment

| Item | Value |
| --- | --- |
| Host | `DESKTOP-EK0STEO` |
| OS | Windows `10.0.19045` |
| Node.js | `v24.15.0` |
| npm | `11.12.1` |
| Docker | `29.5.2` |
| PostgreSQL | `euclida-postgres`, `postgis/postgis:17-3.5` |
| Staging DB | `euclida_staging_rc1`, UTF-8, owner `euclida_user` |
| Reserved staging ports | `3100` / `8944` |

Only `euclida_staging_rc1` was recreated. The shared PostgreSQL container was
not restarted and protected databases were not mutated.

## Migration and schema proof

| Check | Result |
| --- | --- |
| RC5 SQL files | 48 |
| First migration pass | PASS, 48/48 |
| Second migration pass | PASS, 48/48 |
| Schema manifest | PASS, 1452 |
| Critical schema | PASS, 28/28 |
| Legacy WeaponSystem insert blockers | 0 |
| `weapon_model_id` FK | exactly 1 |
| `ammo_depot_id` FK/index | exactly 1 each |
| Duplicate FK signatures | 0 |
| Duplicate index definitions | 0 |

Migration logs:

`C:\Users\НЗ\euclida-staging-tools\rc5\logs`

Backend and frontend `npm ci` and production builds passed. The dependency
install reported existing audit findings; no dependency versions were changed.

## Reproduced blocker

The required transactional TypeORM probes passed for:

- Unit;
- User;
- WeaponModel;
- Depot;
- FirePosition;
- WeaponSystem;
- Shell;
- Charge;
- Fuze;
- Primer;
- ShotConfiguration;
- ServiceOrder;
- ServiceOrderDelivery.

The `ExecutionRecord` probe failed before commit:

```text
QueryFailedError:
column "posted_at" of relation "execution_records" does not exist
```

Comparison of the RC5 entity with the clean database showed two missing
columns:

- `execution_records.posted_at`;
- `execution_records.posted_by_user_id`.

After adding those columns to staging for diagnostic continuation, the same
probe exposed a second schema/runtime mismatch:

```text
new row for relation "execution_records" violates
check constraint "chk_execution_records_purpose"
```

RC5 runtime normalizes purposes to:

```text
barrel_warmup, adjustment, main_fire, additional_fire, other
```

The clean schema constraint still allowed the legacy values:

```text
main, adjustment, warmup, calibration, test, other
```

Therefore both creation and posting of normal execution records can fail on a
clean RC5 installation. This is a reproduced release blocker, not a fixture
configuration issue.

## Focused RC6 correction

The stabilization correction adds the idempotent migration
`50_execution_record_posting_shape_guard.sql`. It:

- adds `posted_at` and `posted_by_user_id`;
- normalizes historical purpose values;
- replaces the stale purpose constraint with the canonical runtime values.

The release verifier now requires 30 critical columns.

Correction verification:

- migration 50 applied twice to staging;
- the complete 49-file candidate migration set applied twice to a separate
  clean verifier database;
- candidate manifest count: 1454;
- all 15 TypeORM entity probes passed against the clean verifier DB;
- the probe transaction rolled back;
- execution engine tests: 1 suite, 7 tests passed.

## Stopped checks

Per the immediate-blocker policy, RC5 verification stopped before runtime
startup. The following results are not claimed:

- backend cold start, login, and WebSocket handshake;
- runtime API CRUD fixtures;
- FirePosition readiness and assignment;
- deterministic suggestions;
- two-session ServiceOrder workflow;
- stock posting and idempotency;
- maintenance and archive lifecycle;
- realtime and reconnect;
- UI smoke and screenshots;
- restart and recovery.

## Cleanup and live isolation

No `STAGING-RC5-*` runtime fixtures were created, so no fixture deletion was
required. The staging database and diagnostic logs remain for inspection.
Ports `3100` and `8944` are stopped.

Live counts and checksums were identical before and after:

| Table | Count |
| --- | ---: |
| `users` | 32 |
| `service_orders` | 49 |
| `service_order_deliveries` | 65 |
| `stock_operations` | 22 |
| `stock_movements` | 143 |
| `weapon_systems` | 2 |
| `fire_positions` | 4 |

The live database contains no `STAGING-RC5-*` users or orders. Live backend and
frontend PIDs remain `11108` and `21208`.

## Recommendation

Do not promote RC5. Create RC6 from the focused execution schema correction and
repeat the complete isolated staging verification from a new clean worktree.
