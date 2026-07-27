# CORE-FLOW-S1 stabilization

Date: 2026-07-15

## Active state machines

### Weapon readiness

`combat_ready` and `not_combat_ready` are the only active values. A non-ready
weapon has one of: `breakdown`, `maintenance`, `air_threat`, `crew`, `other`.
Returning to `combat_ready` is always an explicit operator action.

### Fire-position assignment

Active assignment has no transit state:

1. `POST /weapon-systems/:id/assign-to-fire-position`
2. Lock weapon and target fire position.
3. Reject a non-`combat_ready` weapon and reject occupied positions.
4. Set `currentFirePositionId` and `deploymentStatus=at_fire_position`.
5. Write one `weapon_deployments` row with `status=arrived` and arrival time.

Removal uses `POST /weapon-systems/:id/move-to-reserve`, immediately clears
`currentFirePositionId`, and writes an arrived history row. The active UI exposes
only `Призначити на ВП` and `Зняти з ВП`.

### Derived fire-position readiness

A fire position uses the pure `deriveFirePositionOperationalState` result. An
explicit `threat`, `damaged`, `prohibited`, or `other` block wins. Otherwise, no
canonical weapon produces `СГ не призначена`, a non-BG weapon produces
`СГ НЕ БГ: <localized reason>`, and a `combat_ready` weapon makes the position
ready. Weapon readiness is authoritative; derived state is never persisted by a
read endpoint.

Allowed position block reasons are `threat`, `damaged`, `prohibited`, `other`.
Assignment never changes the block reason. No assigned weapon and a non-ready
assigned weapon both derive `not_combat_ready` without manufacturing a block
reason. Manual fire-position BG controls are absent from the active UI.

### Air threat

An applicable threat sets the position block to `threat` and the assigned weapon
to `not_combat_ready/air_threat`. Recalculation compares the canonical target
state before saving, so an identical transition is not saved repeatedly. Removing
the threat clears the position block but does not restore weapon BG.

### ServiceOrder execution

The active terminal workflow is:

`draft -> proposed -> sent -> accepted -> in_progress -> completed`

While `in_progress`, consumption is:

`execution draft -> validate -> post through StockEngine -> complete`

Posting uses `execution:<record-id>` as the stock idempotency key. Repeated post
returns the same stock operation. Completion requires at least one posted record,
rejects unposted consumable drafts, sums actual quantity from posted records, and
does not write stock. Legacy direct completion methods remain in source for read
compatibility but are no longer reachable from `complete()`.

## Active and legacy fields

| Domain | Active | Legacy/read compatibility only |
| --- | --- | --- |
| Weapon readiness | `readiness_status`, `not_ready_reason` | old readiness values normalized by migration |
| Assignment | `current_fire_position_id` with `deployment_status=at_fire_position` | `fire_position_id`, `location_type` |
| Assignment history | completed `weapon_deployments` rows | `planned`, `moving`, `cancelled` rows and movement endpoints |
| FP block | `not_ready_reason` | raw `readiness_status`, `has_sg` |
| Shot kit | `selected_shot_configuration_id`, kit charges | `selected_zone_id`, shell/charge compatibility tables |
| Consumption | posted `execution_records`, `stock_operation_id` | direct completion write-off helpers |

`database/init/47_core_flow_s1_normalization.sql` is rerunnable. It normalizes
weapon readiness/reasons and clears every fire-position pseudo-reason except the
explicit block set `threat`, `damaged`, `prohibited`, `other`. In particular,
stale `not_prepared` is cleared. It does not alter weapon assignment or discard
historical tables.

## Suggestion algorithm

The active artillery candidate query uses only canonically assigned weapons and
the same derived position helper as list, detail, map, and analytics responses.
Rejected candidates retain the exact localized operational reason. It requires
weapon BG, no position block, no other active order on the position, target
sector coverage, and a local depot. For each weapon model it loads shot kits and
depot balances, then validates:

- kit is active and matches the weapon model;
- complete shell, fuze, primer, and every charge component;
- distance is at most `maxRangeM`;
- stock covers planned quantity, including exact mixed-charge quantities.

Compatible variants are ordered by validity, shortest sufficient maximum range,
range reserve, available complete shots, then stable candidate ID. Rejected kits
carry explicit reasons. An entirely empty candidate set returns an explicit API
error rather than a silent empty array.

Standalone weapons are not emitted in the current artillery domain because a
standalone `WeaponSystem` has no canonical coordinates or ammunition source from
which distance and stock sufficiency can be computed. No legacy location field is
used to guess those values.

## UI

- Weapon cards use immediate assignment/removal and hide movement/arrival actions.
- Fire-position cards display derived readiness and no manual BG confirmation.
- ServiceOrder execution validates before post.
- The large three-column incoming-delivery block is removed from the active main
  screen; deliveries remain in the notification overlay/center and unread count.
- The main board defaults to active work. Completed/history remain explicit tabs.
- Row action menus have bounded height, viewport-safe width, scrolling, and a
  raised stacking context.

## Verification transcript

CORE-FLOW-S1.1 automated verification on 2026-07-27:

```text
backend: 14 suites, 81 tests passed
frontend: 11 files, 44 tests passed
backend production build: passed
frontend production build: passed
authenticated API smoke: passed
```

`backend/scripts/core-flow-s1-1-readiness-smoke.js` creates an isolated
fire-position/weapon fixture, reuses a stocked depot only for the duration of the
test, verifies list/card/map/suggestion consistency for BG, breakdown, restored
BG, removal, and explicit threat states, then removes the fixture. Chrome UI
automation could not complete because the Windows browser controller could not
reliably establish the current URL; the API smoke and cleanup did complete.

Automated verification on 2026-07-15:

```text
backend unit/regression: 13 suites, 69 tests passed
backend e2e auth boundary: 1 suite, 1 test passed
backend production build: passed
frontend production build: passed
frontend tests: 9 files, 31 tests passed
```

The reusable authenticated workflow is
`backend/scripts/core-flow-s1-smoke.js`. It performs create, suggest, kit select,
send, delivery view/accept, start, execution draft, validate, double post,
complete, and notification verification, and prints order/delivery/record/stock
operation IDs.

A fresh live transcript could not be completed in this Codex desktop run: the
new backend process listened locally, but the client repeatedly received local
TCP `ETIMEDOUT` across the execution boundary. The prior real-DB transcript in
`OPS_RUNTIME_END_TO_END.md` proves the same journal/post idempotency path on this
database, but it is not presented as a fresh CORE-FLOW-S1 run.
