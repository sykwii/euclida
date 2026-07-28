# STAGING-ENV-1

## Verdict

Environment creation: **PASS**

RC1 verification: **STOPPED on a reproducible schema blocker**

## Release source

- Worktree: `C:\Users\НЗ\euclida-core-v1-rc1`
- Branch: `release/core-v1.0-rc1`
- Commit: `0340c3ecc3ea292b79728526ac9b0db52274dce1`
- Tag: `core-v1.0-rc1`
- Release worktree status after setup: clean

## Environment

- Host: `DESKTOP-EK0STEO`
- OS: Windows 10 Pro 10.0.19045
- Node.js: v24.15.0
- npm: 11.12.1
- Docker: 29.5.2
- Docker Compose: v5.1.3
- PostgreSQL container: `euclida-postgres`
- PostgreSQL image: `postgis/postgis:17-3.5`

## Isolated identifiers

- Database: `euclida_staging_rc1`
- Database owner: `euclida_user`
- Encoding: UTF8
- Extensions: `pgcrypto`, `plpgsql`, `postgis`, `uuid-ossp`
- Backend port: `3100`
- Frontend port: `8944`
- Data prefix: `STAGING-RC1-`
- Local configuration: `.env.staging.local` (Git-ignored, not committed)
- External logs: `C:\Users\НЗ\euclida-staging-tools\logs`

Ports 3100 and 8944 were free before setup. Existing services on ports 3000
and 8844 were not stopped, restarted, or reconfigured.

## Database isolation

Before database creation, the shared container contained:

- `euclida_situation_db`
- `euclida_analytics_db`
- `euclida_logistics_db`
- `postgres`

`euclida_staging_rc1` did not exist and could not alias any existing PostgreSQL
database. It was created through the `postgres` maintenance database with the
project owner, UTF8 encoding, and PostGIS enabled only in the new database.

Every migration invocation prepended a guard that aborted unless:

```sql
current_database() = 'euclida_staging_rc1'
```

The guard also explicitly rejected the three existing Euclida databases and
`postgres`.

## Live precheck

The following exact live row counts were recorded before staging creation:

| Table | Rows |
| --- | ---: |
| execution_records | 24 |
| fire_positions | 4 |
| operational_notifications | 128 |
| service_order_deliveries | 65 |
| service_orders | 49 |
| stock_movements | 143 |
| stock_operations | 22 |
| users | 32 |
| weapon_systems | 2 |

No `staging_rc1_` user existed in the live database. No write statement was
executed against a live database.

## Migration execution

RC1 contains exactly 47 SQL files in filename order.

- First pass: PASS, 47/47
- Second pass: PASS, 47/47
- `ON_ERROR_STOP=1`: enabled
- Partial migration: absent
- Duplicate constraint/index failure: absent

Logs:

- `migrations-pass-1.log`
- `migrations-pass-2.log`
- `migration-manifest.sha256`
- `staging-schema-identity.txt`

## RC1 blocker

After both successful migration passes, the clean staging schema lacked
`weapon_systems.weapon_model_id`, while the RC1 TypeORM entity requires that
column:

```text
ERROR: column "weapon_model_id" does not exist
LINE 1: SELECT weapon_model_id FROM weapon_systems LIMIT 0;
```

The existing live database has the nullable UUID column, showing that historical
live drift had masked the clean-install defect.

Evidence:

`C:\Users\НЗ\euclida-staging-tools\logs\rc1-blocker-weapon-model-column.txt`

No RC1 backend, frontend, authenticated, UI, or restart smoke was started after
this blocker was confirmed.

## Safety outcome

- No existing database was dropped or truncated.
- The shared PostgreSQL container was not restarted.
- Existing processes on 3000/8844 were untouched.
- The original dirty-worktree stash was not applied or dropped.
- `euclida_staging_rc1` remains available for inspection.
