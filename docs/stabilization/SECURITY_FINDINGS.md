# SECURITY FINDINGS

Date: 2026-07-30

## Closed Findings

| ID | Severity | Finding and reproduction | Resolution | Regression proof |
| --- | --- | --- | --- | --- |
| SEC-001 | High | Production dependency trees contained known High/Critical advisories. | Pinned patched Nest/Swagger/pg/helmet and Angular packages; regenerated lockfiles. | production audits, clean builds/tests |
| SEC-002 | Critical | Production JWT configuration allowed unsafe defaults and request claims could outlive user role/scope changes. | Required a strong secret, fixed algorithm/issuer/audience/expiry, and reloaded active user/role/scope in the guard. | `jwt-config.spec.ts`, `jwt-auth.guard.spec.ts`, HTTP smoke |
| SEC-003 | High | Broad CORS/realtime policy and query-string socket tokens increased credential exposure and cross-origin access. | Strict origin policy, authenticated handshake, no query token, scope recheck. | CORS/gateway specs and 7/7 realtime smoke |
| SEC-004 | High | Login behavior allowed enumeration/brute-force pressure. | Generic response, dummy bcrypt for missing users, 5/60 rate limit. | login browser smoke and backend HTTP smoke |
| SEC-005 | High | Unit endpoints accepted cross-unit identifiers without consistent scope enforcement. | Central unit-scope validation applied to reads/writes. | `units.controller.spec.ts`, 29/29 HTTP smoke |
| SEC-006 | High | User entities could serialize `passwordHash` in normal query/response paths. | `select: false` plus explicit response sanitization. | `user-security.spec.ts` |
| SEC-007 | High | CSV cells and large/unbounded document/Recon input could reach unsafe consumers or exhaust resources. | Formula-prefix protection, kind whitelist, size/row limits, DTO constraints. | document and Recon DTO specs |
| SEC-008 | High | Leaflet HTML strings included user-controlled values; frontend dependencies also contained a Critical advisory. | Shared HTML escaping at all reviewed map/recon/home sinks and dependency updates. | escape unit tests and live 5/5 stored-XSS smoke |
| SEC-009 | Critical | Production configuration retained unsafe secret/database defaults. | Production startup now rejects missing/weak values; compose no longer supplies a default password. | JWT/config tests and cold staging startup |
| SEC-010 | Medium | Generic login errors could fail to render and background 401 handling could recursively append login redirects. | Explicit change detection and guarded redirect handling. | login/API service specs and browser auth smoke |
| SEC-011 | Medium | Strict query validation rejected the frontend Recon `_ts` cache-buster. | Added the documented optional query field without weakening the whitelist. | Recon DTO spec and route smoke |
| SEC-012 | Medium | Delayed Leaflet invalidation/renderer work could execute after DOM teardown. | Cancelled timers and removed paths/renderers in deterministic order. | map teardown specs, 66/66 frontend tests, browser route smoke |

## Open Findings

No unresolved Critical or High production finding remains.

## Accepted Risks

| ID | Severity | Risk | Rationale / control |
| --- | --- | --- | --- |
| AR-001 | Moderate | TypeORM migration-generation CLI advisory in production audit metadata. | Local privileged CLI path, not remotely reachable; production runtime has 0 High/Critical. |
| AR-002 | High (development only) | Backend development toolchain contains transitive advisories. | Not shipped in production; isolated build hosts and production-only installs required; dedicated upgrade follow-up. |
| AR-003 | Informational | Leaflet CommonJS optimization warning. | Build/runtime verified; no security impact observed. |

## File Classification

- Security fixes: production configuration, auth, guards, users/units, documents/Recon, realtime, frontend API/auth/HTML sinks, dependency manifests/lockfiles, compose.
- Regression tests: new/updated backend and frontend specs plus isolated security smoke scripts.
- Migrations: none.
- Documentation: the five `SECURITY_*.md` files only.
- Unrelated changes: none included.
