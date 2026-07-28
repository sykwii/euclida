# STAGING-VERIFY-RC2

## Verdict

**FAIL: clean-schema compatibility blocker**

Verified release:

- Commit: `2497d01b3b21c6a0afe808dbde11aad007f72e6b`
- Branch: `release/core-v1.0-rc2`
- Tag: `core-v1.0-rc2`
- Worktree: `C:\Users\НЗ\euclida-core-v1-rc2`

The RC2 worktree remained clean throughout verification.

## Environment

- Host: `DESKTOP-EK0STEO`
- OS: Windows 10 Pro 10.0.19045
- PostgreSQL container: `euclida-postgres`
- Staging database: `euclida_staging_rc1`
- Backend port: `3100`
- Frontend port: `8944`
- Live database: `euclida_situation_db`
- Live ports: `3000`, `8844`

The existing live PIDs were recorded before testing. Ports 3100 and 8944 were
free. No live process or shared PostgreSQL container was restarted.

## Clean database and migrations

Only `euclida_staging_rc1` was terminated, dropped, and recreated through the
`postgres` maintenance database. The database name was checked against the
protected database list before the operation.

Configuration:

- owner: `euclida_user`;
- encoding: UTF8;
- PostGIS: enabled;
- connection guard: exact `current_database() = 'euclida_staging_rc1'`.

Migration results:

| Check | Result |
| --- | --- |
| RC2 SQL files | 47 |
| First pass | PASS, 47/47 |
| Second pass | PASS, 47/47 |
| `ON_ERROR_STOP=1` | enabled |
| `weapon_systems.weapon_model_id` | present, UUID |
| Weapon model FK | present |
| Weapon model index | present |
| Schema manifest | 1441 |
| Clean comparison manifest | 1441 |
| Manifest difference | 0 |

Full logs are stored under:

`C:\Users\НЗ\euclida-staging-tools\rc2\logs`

## Reproduced RC2 blocker

The RC2 migration fixed the missing canonical column, but the clean schema still
retained two unmapped legacy columns:

| Column | Nullable | Default |
| --- | --- | --- |
| `weapon_systems.system_type` | no | none |
| `weapon_systems.model` | no | none |

The canonical RC2 `WeaponSystem` entity maps `weapon_model_id` and does not map
either legacy column. An entity-shape INSERT inside a transaction reproduced the
runtime failure:

```text
ERROR: null value in column "system_type" of relation "weapon_systems"
violates not-null constraint
```

The failed transaction was automatically rolled back. No fixture remained.

The live database does not contain these legacy columns, demonstrating that
historical live schema drift had hidden the clean-install incompatibility.

Evidence:

`C:\Users\НЗ\euclida-staging-tools\rc2\logs\rc2-blocker-legacy-weapon-columns.txt`

## Skipped after blocker

Per the stop-on-defect policy, these RC2 checks were not started:

- staging fixture/admin creation;
- backend and frontend startup;
- readiness and deterministic suggestion smoke;
- two-session ServiceOrder flow;
- execution, stock, and idempotency proof;
- maintenance and archive smoke;
- realtime and reconnect smoke;
- UI smoke and screenshots;
- backend/database-session recovery.

No RC2 HTTP or websocket request was sent to ports 3000 or 8844.

## Focused correction for RC3

The stabilization correction:

1. makes legacy `weapon_systems.system_type` nullable when the column exists;
2. makes legacy `weapon_systems.model` nullable when the column exists;
3. adds an automated canonical insert-shape check to the migration verifier;
4. corrects the critical-schema assertion count to 19.

Regression proof:

```text
critical schema: PASS, 19 columns
weapon insert shape: PASS
schema comparison: 1441 / 1441, difference 0
canonical transactional INSERT: PASS, rolled back
```

## Live isolation

The precheck showed no `STAGING-RC2-*` users or orders in the live database.
No write statement targeted `euclida_situation_db`; no live database was dropped,
truncated, migrated, or restarted.

## Recommendation

Do not promote RC2. Create RC3 from the focused compatibility fix and repeat the
complete staging verification from a freshly recreated `euclida_staging_rc1`.
