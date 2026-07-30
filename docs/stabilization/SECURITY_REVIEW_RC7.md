# SECURITY REVIEW RC7

Date: 2026-07-30

## Verdict

PASS. Application commit `ae89d7950bfbc80e2adf3e32314625a3282f0ce7` is eligible to be used as the application source for RC7.

RC7 branch/tag was not created. No merge was performed. `stash@{0}` (`pre-release-dirty-worktree`) was not applied, changed, or dropped.

Reviewed base application commit: `b033731c7916deb27f099bb4d4387324a5cbc145`.

## Scope

The review covered authentication and authorization, unit scoping, response serialization, HTTP and WebSocket policy, login abuse controls, production configuration, uploaded/imported data limits, CSV output, frontend HTML sinks, dependency advisories, clean-schema runtime behavior, core ServiceOrder behavior, and isolated browser behavior.

No business workflow, DTO contract, route, status transition, stock posting, or database schema change was introduced.

## Verification Matrix

| Gate | Result | Evidence |
| --- | --- | --- |
| Backend clean install/build | PASS | `logs/final-regression-backend-npm-ci.log`, `logs/final-regression-backend-build.log` |
| Backend tests | PASS, 25 suites / 133 tests | `logs/final-regression-backend-tests.log` |
| Frontend clean install/production build | PASS | `logs/final-regression-frontend-npm-ci.log`, `logs/final-regression-frontend-build-leaflet-teardown.log` |
| Frontend tests | PASS, 14 files / 66 tests | `logs/final-regression-frontend-tests-leaflet-teardown.log` |
| SQL migrations | PASS, 50/50 twice | `logs/final-regression-migrations-pass-1.log`, `logs/final-regression-migrations-pass-2.log` |
| Canonical API | PASS, 60/60 | `logs/final-core-api-smoke.log` |
| Security HTTP | PASS, 29/29 | `logs/final-regression-security-http.log` |
| Security realtime | PASS, 7/7 | `logs/final-regression-security-realtime.log` |
| ServiceOrder core flow | PASS | `logs/final-regression-core-flow-e2e.log` |
| Main browser routes/layout | PASS, 26/26 routes and 8/8 layout checks | `browser/security-browser-smoke.json` |
| Stored XSS surfaces | PASS, 5/5 surface groups | `browser/xss-surfaces.json` |
| Two-session realtime browser | PASS | `browser/security-browser-smoke.json` |
| Live-port isolation, final runs | PASS, 0 requests to 3000/8844 | both browser JSON reports |
| Production dependency audit | PASS gate, 0 High/Critical | dependency report |

Evidence root: `C:\Users\НЗ\euclida-staging-tools\security-rc7`.

## Security Changes

- SEC-001: pinned patched production dependencies and regenerated lockfiles.
- SEC-002: made production JWT configuration strict and revalidated active user, role, and scope for guarded requests.
- SEC-003: restricted CORS and WebSocket authentication; removed query-token authentication.
- SEC-004: added generic login failures, dummy bcrypt work, and a 5 attempts / 60 seconds rate limit.
- SEC-005: enforced unit-scoped access on Unit endpoints.
- SEC-006: excluded password hashes from normal selection and sanitized user responses.
- SEC-007: protected CSV exports from spreadsheet formula injection and bounded/validated document and Recon inputs.
- SEC-008: escaped user-controlled HTML in Leaflet content and updated vulnerable frontend packages.
- SEC-009: removed unsafe production secret/database fallbacks from configuration and compose defaults.
- SEC-010: stabilized generic login error rendering and prevented recursive login redirects on background 401 responses.
- SEC-011: allowed the documented Recon cache-buster query under strict validation.
- SEC-012: removed Leaflet layers/renderers deterministically during teardown to prevent delayed canvas failures.

Detailed status and tests are in `SECURITY_FINDINGS.md`.

## Environment and Isolation

- Node.js: `v24.15.0`
- npm: `11.12.1`
- Docker: `29.5.2`
- Staging frontend: `http://127.0.0.1:8944`
- Staging API/WebSocket: `http://127.0.0.1:3100`
- Staging database: `euclida_staging_rc1`
- Isolated PostgreSQL container: `euclida-security-rc7-postgres`, host port `55432`

The final browser tests launched their own bundled Chromium processes and fresh persistent profiles under the evidence directory. They did not enumerate, attach to, or manipulate an existing Chrome window or profile.

An early browser guard run used a stale frontend runtime configuration and emitted two unauthenticated requests to port 3000. Both returned 401, the guard stopped the run, no credential was accepted, and no mutation occurred. The configuration was replaced with the isolated production static server; every final browser run recorded zero requests to ports 3000/8844.

## Accepted Risks

- AR-001: backend production audit retains one Moderate advisory through the TypeORM migration-generation CLI path. It is a local privileged developer command and is not reachable from the running HTTP/WebSocket application.
- AR-002: the full backend development dependency tree still reports toolchain advisories, including High items. The production-omitted audit has zero High/Critical. Continue monitoring and update the build toolchain in a dedicated change.
- AR-003: the frontend build reports the known Leaflet CommonJS optimization warning. It has no observed security or runtime effect.

There are no unresolved Critical or High production findings.

## RC7 Gate

All requested gates are PASS and reports are complete. The exact application commit eligible for RC7 is:

`ae89d7950bfbc80e2adf3e32314625a3282f0ce7`
