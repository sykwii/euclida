# SECURITY ROUTE MATRIX

Date: 2026-07-30

Source inventory: `C:\Users\НЗ\euclida-staging-tools\preflight-all\artifacts\route-inventory.json`.

The structured inventory contains 272 routes. The application registers `JwtAuthGuard` and `HttpWriteGuard` globally. Controller/method guards below are additional local declarations; therefore a write route without a local `WriteAccessGuard` is still protected by the global write policy.

## Guard Summary

| Local guard declaration | Routes |
| --- | ---: |
| `JwtAuthGuard` | 84 |
| `JwtAuthGuard;WriteAccessGuard` | 71 |
| `JwtAuthGuard;MainScopeGuard` | 38 |
| `JwtAuthGuard;WriteAccessGuard;MainScopeGuard` | 38 |
| `JwtAuthGuard;MainScopeGuard;WriteAccessGuard` | 35 |
| `JwtAuthGuard;AdminOnlyGuard` | 4 |
| No local guard | 2 |
| **Total** | **272** |

The two routes with no local guard are:

| Method/path | Effective policy | Decision |
| --- | --- | --- |
| `GET /` | Public health/root response | Intended public endpoint |
| `POST /auth/login` | Public entry plus `LoginRateLimitGuard` | Intended; generic failure and throttling verified |

## Authorization Matrix

| Surface | Read | Write | Scope/role constraint | Verification |
| --- | --- | --- | --- | --- |
| Authentication | Public login only | Login rate limited | Active user reloaded on later requests | HTTP smoke and guard tests |
| Users | Authenticated | Write policy | Admin-only management; password hash excluded | user security tests |
| Units | Authenticated | Write policy | Unit hierarchy scoped; cross-unit IDs rejected | Unit IDOR tests and HTTP smoke |
| ServiceOrders | Authenticated | Write policy | Existing scope/workflow checks preserved | canonical API and core E2E |
| Fire positions | Authenticated | Write policy | Existing unit/operational rules | canonical API and browser smoke |
| Weapon systems | Authenticated | Write policy | Existing unit/operational rules | HTTP, realtime, browser smoke |
| Stock/depots | Authenticated | Write policy | Existing scope and posting rules | canonical API and core E2E |
| Recon | JWT + main scope | Write policy | Main operational scope required | DTO tests, route/browser smoke |
| Documents | Authenticated | Write policy | kind whitelist, size/row constraints | document security tests |
| Notifications | Authenticated | Write policy | recipient user/unit filtering | realtime and two-session browser |
| Realtime | JWT during handshake | Event-specific checks | active user/role/scope reloaded; no query token | 7/7 smoke and gateway tests |
| Settings/admin | Authenticated | Write policy | admin guard where declared | route inventory review |

## Global Write-Guard Review

The inventory shows legacy write endpoints whose controller declarations do not repeat `WriteAccessGuard`, including fire missions, notifications, shifts, and a stock-engine operation. They are covered by the global `HttpWriteGuard`; observer mutations are denied. Login is the only intended unauthenticated POST.

## Result

PASS. No unguarded privileged route or cross-unit route exposure remains in the reviewed inventory. The complete machine-readable route list is retained in the source inventory rather than duplicated into this report.
