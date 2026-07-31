# RC7 FINAL VERIFY

Date: 2026-07-31

## Verdict

PASS. RC7 was created from the exact reviewed application commit and passed immutable verification.

- Application commit: `ae89d7950bfbc80e2adf3e32314625a3282f0ce7`
- Release branch: `release/core-v1.0-rc7`
- Release branch commit: `ae89d7950bfbc80e2adf3e32314625a3282f0ce7`
- Annotated tag: `core-v1.0-rc7`
- Tag object: `3a16038f3ee16239a36076fbe21db476ca604f1c`
- Tag target commit: `ae89d7950bfbc80e2adf3e32314625a3282f0ce7`
- Documentation baseline: `e656b0a2926081ec14a5a54c254ed5653d080154`
- Clean worktree: `C:\Users\НЗ\euclida-core-v1-rc7`

The release branch and tag were pushed normally. No merge to `main`/`master`, rebase, force push, hard reset, or clean operation was performed.

## Repository Audit

The original worktree was clean before ref creation. The review branch was a strict four-commit linear continuation of `origin/stabilization`; `stabilization` was advanced with `--ff-only` and pushed from `df61ba7` to `e656b0a`.

`stash@{0}` remained unchanged:

`c21ad402bef557437bda14aea11fd550f176ca6b On (no branch): pre-release-dirty-worktree`

The RC7 worktree remained clean after install, build, tests, runtime verification, and cleanup. `git describe --exact-match --tags HEAD` returned `core-v1.0-rc7`.

## Build and Tests

All commands were run from `C:\Users\НЗ\euclida-core-v1-rc7`.

| Gate | Result | Evidence |
| --- | --- | --- |
| Backend `npm.cmd ci` | PASS | `logs/backend-npm-ci.log` |
| Backend build | PASS | `logs/backend-build.log` |
| Backend tests | PASS, 25 suites / 133 tests | `logs/backend-tests.log` |
| Frontend `npm.cmd ci` | PASS | `logs/frontend-npm-ci.log` |
| Frontend production build | PASS | `logs/frontend-build.log` |
| Frontend tests | PASS, 14 files / 66 tests | `logs/frontend-tests.log` |

The frontend production build retained the accepted Leaflet CommonJS optimization warning.

## Migrations and Schema

An isolated `postgis/postgis:17-3.5` container exposed only `127.0.0.1:55433` and hosted database `euclida_staging_rc7`.

- Migration files found in lexical filename order: 50.
- First pass with `ON_ERROR_STOP=1`: `TOTAL=50`, PASS.
- Second pass with `ON_ERROR_STOP=1`: `TOTAL=50`, PASS.
- Duplicate constraint/index errors: none.
- Production-mode Nest application-context bootstrap: PASS.
- Runtime entity metadata: 71 entities.
- Missing mapped tables: 0.
- Missing mapped columns: 0.
- Duplicate runtime table mappings: 0.
- Critical schema contract: 9 tables, 11 columns, and 3 indexes, PASS.

The audit retained 41 nullability and 6 length metadata differences already classified by release preflight as informational schema supersets/legacy metadata differences. Precision mismatch remained 0; none caused runtime or critical drift.

Evidence: `logs/migrations-pass-1.log`, `logs/migrations-pass-2.log`, `logs/runtime-schema-audit.log`, `logs/critical-schema.log`, and `artifacts/runtime-schema-audit.json`.

The first production process launch intentionally failed closed because the staging harness had omitted mandatory `CORS_ORIGINS`. After setting the exact origin `http://127.0.0.1:8944`, the same immutable build started successfully. No code or release ref changed.

## Authenticated Release Smoke

The API seed/contract run passed 60/60 calls. The final workflow then verified:

`login -> WeaponModel -> WeaponSystem -> FirePosition -> assignment -> derived readiness -> ServiceOrder -> suggestion -> executor/kit selection -> send -> delivery -> accept -> start -> execution draft -> validate -> post -> repeated post -> complete`

Results:

- Derived-ready fire positions before the workflow: 2.
- Completed order: `RC7-FINAL-FLOW-1785484589610`.
- Posted execution records: 2.
- Distinct stock operations: 2.
- Stock movements: 8.
- Repeated post returned the original stock-operation ID.
- Duplicate component movements per operation: 0.
- Duplicate recipient delivery keys: 0.
- Duplicate notification source keys: 0.
- Blocking draft and insufficient-stock validation behaved correctly.
- Repeated completion kept the same completed result.
- API 500 responses: 0.

The security realtime smoke passed 7/7, including anonymous/query/expired-token rejection, unit scoping, unique event keys, and archived-user disconnection.

A legacy diagnostic script reported multiple frames because one mutation intentionally fans out to distinct `weapons`, `map`, `events`, `analytics`, and `all` scopes. It was not used as the duplication gate. The canonical 7/7 security smoke and browser test verified unique keys, one active socket, and one notification after reconnect.

Evidence: `logs/core-api-seed.log`, `logs/core-flow-smoke.log`, `logs/core-flow-db-proof.log`, and `logs/security-realtime-smoke.log`.

## Browser Verification

Playwright `1.55.0` launched bundled Chromium with fresh persistent profiles under the final evidence directory. It did not inspect or attach to an existing browser/profile.

- Routes: 26/26 PASS.
- Layout checks: 8/8 PASS at 1920x1080 and 3440x1440.
- Stored XSS payloads rendered as text.
- Executable injected images/scripts/unsafe links: 0.
- `window.__xssTriggered`: false.
- Two-session realtime: PASS.
- Recipient sockets before and after reload: exactly 1.
- Matching notification before and after reload: exactly 1.
- Page errors: 0.
- API 5xx: 0.
- Fatal console errors: 0.
- Network-policy violations: 0.
- Requests to live ports 3000/8844: 0.

Evidence root: `C:\Users\НЗ\euclida-staging-tools\security-rc7-final\browser`, including JSON result, console/network exports, HAR files, trace, and deterministic screenshots.

## Live Isolation

Live services were recorded before and after:

| Port | PID before | PID after | Result |
| --- | ---: | ---: | --- |
| 3000 | 11108 | 11108 | unchanged |
| 8844 | 21208 | 21208 | unchanged |

Read-only live database counts were identical before and after:

| Table | Before | After |
| --- | ---: | ---: |
| `service_orders` | 50 | 50 |
| `weapon_systems` | 2 | 2 |
| `fire_positions` | 4 | 4 |
| `stock_operations` | 22 | 22 |
| `stock_movements` | 143 | 143 |
| `operational_notifications` | 130 | 130 |

RC7/SECURITY-BROWSER prefixed orders in live DB: 0. RC7-prefixed weapons and fire positions in live DB: 0. No authenticated browser request or WebSocket targeted the live backend.

Evidence: `artifacts/live-counts-before.txt`, `artifacts/live-counts-after.txt`, `artifacts/live-pids-before.json`, and `artifacts/live-pids-after.json`.

## Cleanup

- Stopped only RC7 backend PID on 3100.
- Stopped only RC7 frontend PID on 8944.
- Removed only container `euclida-final-rc7-postgres` and its isolated fixtures.
- Removed generated DB/JWT/admin credential files.
- Ports 3100, 8944, and 55433 were released.
- Live services on 3000/8844 remained running.
- Release branch, annotated tag, clean RC7 worktree, logs, screenshots, HAR, trace, and reports were retained.
- `stash@{0}` was not modified.

## Accepted Risks

- One Moderate production audit advisory remains in the local TypeORM migration-generation CLI path; it is not reachable from the running application.
- Development-only toolchain advisories remain outside the production runtime dependency set.
- Leaflet emits the known CommonJS optimization warning.
- Informational entity nullability/length metadata differences remain documented; critical runtime drift is zero.

There are no reproduced unresolved Critical or High production defects.

## Recommendation

Promote `core-v1.0-rc7` / `release/core-v1.0-rc7` as the staging and production candidate.
