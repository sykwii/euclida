# STAGING-VERIFY-1

## Verdict

**FAIL: RC1 clean-schema blocker**

This verdict applies to commit
`0340c3ecc3ea292b79728526ac9b0db52274dce1` and tag
`core-v1.0-rc1`.

## Completed checks

| Check | Result |
| --- | --- |
| Exact RC1 worktree and tag | PASS |
| Release worktree clean | PASS |
| Isolated staging DB identity | PASS |
| Ports 3100/8944 free | PASS |
| First migration pass | PASS, 47/47 |
| Second migration pass | PASS, 47/47 |
| PostGIS and schema identity | PASS |
| Protected live DB guard | PASS |
| Clean schema matches runtime entities | FAIL |

## Exact reproduction

Database:

```text
euclida_staging_rc1
```

Entity declaration:

```text
backend/src/weapon-systems/weapon-system.entity.ts
@Column({ name: 'weapon_model_id', type: 'uuid' })
```

Clean RC1 schema query:

```sql
SELECT weapon_model_id FROM weapon_systems LIMIT 0;
```

Result:

```text
ERROR: column "weapon_model_id" does not exist
```

The same column exists in `euclida_situation_db`, so live-schema verification
alone did not expose the missing clean migration.

## Skipped checks

The following checks were intentionally not started after the release blocker:

- backend and frontend cold startup;
- staging admin creation;
- authenticated ServiceOrder smoke;
- stock and execution DB proof;
- realtime/reconnect smoke;
- UI checks at 1920x1080 and 3440x1440;
- backend restart;
- staging-session termination/recovery.

This follows the instruction to stop on a reproducible code/schema defect.

## Focused correction

The stabilization correction:

1. adds `weapon_systems.weapon_model_id` with the canonical FK to
   `weapon_models`;
2. adds `idx_weapon_systems_weapon_model`;
3. adds the column to the automated critical-schema assertion.

The corrected scripts passed against `euclida_staging_rc1` and a newly created
temporary database:

```text
PASS: 47 init scripts are strict, clean-applicable, and rerunnable.
critical schema: PASS
schema summary: 1441 / 1441
missing from staging: 0
staging only: 0
```

The temporary verification database was removed. No live database was modified.

## Recommendation

Do not promote RC1. Create RC2 from the focused stabilization fix, repeat clean
migration verification, and execute the deferred authenticated/UI/reconnect
checks against the isolated staging environment.
