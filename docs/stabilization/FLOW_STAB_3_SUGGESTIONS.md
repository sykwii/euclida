# FLOW-STAB-3: Deterministic ServiceOrder Suggestions

## Scope

This stabilization changes only ServiceOrder executor suggestion and selection.
It preserves immediate assignment, derived FirePosition readiness, routes, DTOs,
workflow statuses, stock ownership and execution behavior.

No schema change was made.

## Canonical Data

The active artillery path uses:

- `weapon_systems.current_fire_position_id`;
- `weapon_systems.deployment_status = at_fire_position`;
- `weapon_systems.readiness_status = combat_ready`;
- active weapon maintenance state;
- active complete `shot_configurations`;
- depot shell, charge, fuze and primer stock.

It does not use `weapon_systems.fire_position_id`, `location_type`, `zone_id`
or shell compatibility tables to discover or save a candidate.

Selection is accepted only when a fresh suggestion evaluation contains the
exact FirePosition, weapon and shot kit as a ready combination. Rejected
candidates cannot be selected.

## Evaluator

`service-order-suggestion-evaluator.ts` contains pure evaluation helpers.

For every complete kit it:

1. checks the weapon model and active state;
2. requires shell, fuze, primer and at least one charge;
3. accepts distance equal to `maxRangeM`;
4. calculates shell, fuze and primer demand as `shots`;
5. calculates every charge demand as `quantityPerShot * shots`;
6. calculates executable shots as the minimum capacity of every component;
7. returns exact localized shortage details.

Candidate result fields include:

- `candidateType`, canonical IDs, callsign and unit;
- `distanceM`, `ready`, `score`, `rank`;
- `compatibleKits[]` and `stockSummary`;
- stable rejection codes and separate localized labels.

Supported rejection codes:

`fp_blocked`, `weapon_missing`, `weapon_not_ready`,
`active_maintenance`, `wrong_weapon_model`, `no_active_kit`,
`distance_exceeded`, `shell_shortage`, `charge_shortage`,
`fuze_shortage`, `primer_shortage`, `no_stock_depot`, `outside_scope`,
`invalid_coordinates`.

## Determinism

Candidates are sorted by:

1. ready before rejected;
2. sufficient complete-kit stock;
3. shorter distance;
4. higher executable shot count;
5. callsign;
6. stable UUID.

Repository reads also use explicit stable ordering. One candidate with multiple
kits is returned once with `compatibleKits[]`.

## Query Shape

The artillery evaluation uses batched reads:

- scoped weapons with models and maintenance;
- scoped FirePositions with units and depots;
- one query for occupied FirePositions;
- one query for all relevant shot configurations and components;
- four depot-wide stock queries, one per component category.

There are no per-FirePosition weapon, kit or stock reads in the active path.
Scope filtering is applied before FirePosition, weapon and air-asset response
construction. Responses use explicit candidate projections instead of complete
FirePosition or weapon entities.

## Frontend

Ready candidates are shown first as compact cards. The card reports:

- `ВП` or `Без ВП`;
- weapon;
- distance;
- estimated executable shots;
- valid kit count.

Rejected candidates are collapsed under `Не підходять (N)`. The UI renders
localized labels, never raw rejection enums. A rejected candidate cannot enter
local selection state. Changing the selected weapon clears an incompatible kit,
and a single compatible kit is preselected.

The contextual primary workflow action from FLOW-STAB-2 is unchanged.

## Standalone Weapon Limitation

The current `weapon_systems` schema has no canonical latitude, longitude or
stock-depot columns, and the ServiceOrder selection schema has no selected
standalone-weapon field. The existing weapon models also have no explicit
standalone capability flag.

Therefore production reserve weapons are returned as explained rejected
`standalone_weapon` candidates (`invalid_coordinates`, `no_stock_depot`, and,
for unsupported domains, `weapon_not_ready`). The evaluator supports a valid
standalone projection and has a regression test for it, but persisting such a
selection would require a separate proven schema/domain change. Legacy
`locationType`, `firePositionId` and `zoneId` are deliberately not used as a
substitute.

## Regression Verification

Backend:

```text
15 suites passed
93 tests passed
build passed
```

The focused evaluator coverage includes deterministic repeated sorting, equal
candidate tie-breaks, derived-ready and НЕ БГ weapons, blocked FP, permitted
standalone evaluation, wrong model, no kit, mixed charge capacity, exact missing
component details, max-range equality and outside-scope rejection.

Frontend:

```text
11 files passed
45 tests passed
production build passed
```

The frontend regression covers rejected grouping, rejection labels, prevention
of rejected selection, incompatible-kit clearing and single-kit preselection.

## Authenticated Live Smoke

Script:

`backend/scripts/flow-stab-3-suggestions-smoke.js`

The smoke ran against the local authenticated backend on
`http://127.0.0.1:3013`. It prepared two valid FirePositions, one blocked
FirePosition, one НЕ БГ weapon, one standalone БГ reserve weapon, two active
complete kits and isolated stock for all four component categories.

Result:

```text
suggestion calls: 5
identical complete projections: yes
candidate count: 12
prepared ready candidates: 2
blocked reason: fp_blocked
НЕ БГ reason: weapon_not_ready
standalone explanation: invalid_coordinates, no_stock_depot
selected candidate persisted: yes
selected kit persisted: yes
reloaded order status: proposed
```

Final smoke order:

`43bc5c5d-9bd9-48b0-ba6f-f5deb6fc0bf4`

Selected FirePosition:

`13b0c0a6-8337-4a1d-b244-11404405dafd`

Selected kit:

`0771a53f-815e-4ac4-ab4b-8a75aa81930e`

The smoke did not invoke stock movement or execution APIs. All temporary
orders, weapons, positions, kits and stock rows were removed after persistence
was verified. A clean start found zero prior FLOW-STAB-3 residues; final cleanup
removed the four temporary FirePositions and their four generated depots.
