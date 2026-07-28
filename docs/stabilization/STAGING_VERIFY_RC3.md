# STAGING-VERIFY-RC3

## Verdict

**FAIL: backend dependency-injection blocker**

Verified release:

- Commit: `d40af6907f4c8b56ddfc3b9f4020cd0c145cfcbf`
- Branch: `release/core-v1.0-rc3`
- Tag: `core-v1.0-rc3`
- Worktree: `C:\Users\НЗ\euclida-core-v1-rc3`

The release worktree remained clean.

## Database verification

Only `euclida_staging_rc1` was recreated. Protected databases and the shared
PostgreSQL container were not changed or restarted.

| Check | Result |
| --- | --- |
| SQL files | 47 |
| First migration pass | PASS, 47/47 |
| Second migration pass | PASS, 47/47 |
| Schema manifest | 1441 |
| Required schema columns | PASS, 19/19 |
| Weapon model FK/index | PASS |
| Legacy WeaponSystem insert blockers | absent |
| WeaponModel shape probe | PASS, rolled back |
| WeaponSystem shape probe | PASS, rolled back |
| FirePosition shape probe | PASS, rolled back |
| Depot shape probe | PASS, rolled back |
| ShotConfiguration shape probe | PASS, rolled back |
| ServiceOrder shape probe | PASS, rolled back |

Full logs:

`C:\Users\НЗ\euclida-staging-tools\rc3\logs`

## Runtime blocker

The backend was built successfully and started with explicit staging variables:

```text
DB_NAME=euclida_staging_rc1
PORT=3100
FRONTEND_URL=http://127.0.0.1:8944
```

Nest terminated before opening port 3100:

```text
UnknownDependenciesException:
Nest can't resolve dependencies of the JwtAuthGuard (?, Reflector).
JwtService at index [0] is not available in StockModule.
```

`StockController` uses `JwtAuthGuard`, but `StockModule` does not import the
module that exports `JwtService`. The same pattern exists in multiple feature
modules. Earlier local startup was masked by uncommitted AuthModule imports that
were deliberately excluded from RC1.

Evidence:

- `backend-runtime.err.log`
- backend process exited before port 3100 became available;
- live backend PID on port 3000 remained `11108`;
- live frontend PID on port 8844 remained `21208`.

## Skipped after blocker

The following checks were not started:

- runtime fixture creation;
- frontend startup;
- authenticated readiness and suggestion flow;
- two-session ServiceOrder workflow;
- execution and stock proof;
- maintenance/archive;
- realtime/reconnect;
- UI smoke and screenshots;
- restart/recovery.

No staging HTTP or websocket request reached live ports.

## Focused correction

`AuthModule` is made a Nest global module. It already exports `JwtModule`,
`JwtAuthGuard`, and the related authorization guards, so making that existing
provider boundary global removes repeated per-feature imports and ensures
`JwtService` is available wherever the exported guards are used.

A regression test asserts Nest global-module metadata. The corrected backend is
also cold-started against the isolated staging database as a runtime regression.

## Recommendation

Do not promote RC3. Create RC4 from the focused AuthModule fix and rerun the
complete isolated staging verification.
