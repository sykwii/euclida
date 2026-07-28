# UI-MAP-STAB-1

## Scope

This stabilization changes only WeaponSystem card action layout and FirePosition
map presentation. ServiceOrder, stock mutation, execution, notification routes,
DTOs, statuses, and workflow logic are unchanged.

## Root causes

### Weapon cards

The page applied one non-wrapping flex rule to `.card-actions`, while the card
grid allowed cells as narrow as 290 px. A card with four or more Ukrainian action
labels therefore kept one horizontal row, exceeded its grid track, and painted
under the adjacent card. The card did not have the `min-width: 0` constraints
needed by nested grid/flex content.

The first attempted wide-screen rule also exposed a second issue: four columns
were selected from viewport width even when each card was only about 420 px wide.
The final rule uses auto-fitting action tracks based on available card width.

### FirePosition readiness color

The map icon and side panel used `firePosition.readinessStatus`. That field is a
legacy stored/read-model value and was not the canonical derived operational
state.

For `Дрейк` before the fix:

- stored `fire_positions.readiness_status`: `not_combat_ready`;
- canonical assigned weapon: `Короп`;
- weapon readiness: `combat_ready`;
- active maintenance: absent;
- canonical backend `operationalState.ready`: `true`;
- canonical backend `operationalState.displayState`: `ready`.

The orange/red mismatch was therefore caused by presentation reading the legacy
field instead of the derived result. `displayState` is now produced by the shared
backend readiness helper and consumed by the FP card, map marker, map filter
counters, realtime signature, and map detail badge.

Display mapping is:

- `ready` -> green;
- `danger` -> red;
- `warning` -> amber;
- `unknown` -> gray.

No current backend branch invents a warning state. Missing weapon is `unknown`;
an explicit FP block or non-ready assigned weapon is `danger`.

### Sector geometry

The backend previously repeated the artillery-unit conversion inside create and
update, while the frontend independently interpreted the already converted
boundary fields. Range selection used legacy depot shell/charge compatibility
data first and did not prefer an active shot kit for the assigned weapon model.

The current stored inputs for `Дрейк` are:

- `mainDirectionUnits = 2.00`;
- `traverseLeftUnits = 3.00`;
- `traverseRightUnits = 3.40`.

The documented conversion is one artillery unit = 6 degrees, applied exactly
once:

- main direction: `2.00 * 6 = 12 degrees`;
- left traverse: `3.00 * 6 = 18 degrees`;
- right traverse: `3.40 * 6`, rounded by the existing convention, `21 degrees`;
- left boundary: `12 - 18 = 354 degrees` after normalization;
- right boundary: `12 + 21 = 33 degrees`;
- full angular span across zero: `39 degrees`.

The reported expectation of a main direction near 120 degrees does not match the
stored value. A 120-degree direction would require `mainDirectionUnits = 20.00`.
The fix intentionally does not add a second conversion or reinterpret stored
data.

Sector range now prefers the largest active shot-kit range for the canonical
assigned weapon model. Legacy compatible stock range remains only as a fallback.
The live map DTO returned `maxSectorDistanceM = 17000` for `Дрейк`.

### Stale and duplicate layers

Sectors were added directly to the shared Leaflet layer group. A targeted
realtime refresh removed the marker but not the previous FP sector, so redraws
could accumulate polygons. Weapon changes also emit both `weapon_system` and
targeted `fire_position` map events; handling both immediately could create two
overlapping refresh requests.

Each FP now owns one child layer group keyed by FP ID. The previous group is
removed before redraw. Paired realtime events for the same FP are coalesced into
one 40 ms targeted refresh; the map instance is not recreated.

## Implementation

- Weapon cards use bounded grid tracks and `min-width: 0`.
- Action tracks auto-fit at 150 px minimum; narrow cards collapse to one column.
- Visible action buttons are 38-44 px high and clamp labels to two lines.
- Cancel maintenance, archive, and delete moved to the in-flow secondary menu.
- Canonical readiness helper now returns `displayState`.
- Sector conversion is centralized in the pure `fire-position-sector` helper.
- Frontend sector span handles 0/360 crossing without reconverting units.
- Active shot-kit range is resolved in one batched query for assigned models.
- Realtime replaces only the affected marker and sector layer.

## Verification

Automated:

- backend: 16 suites, 103 tests passed;
- frontend: 11 suites, 55 tests passed;
- backend and frontend production builds passed;
- sector helper covers `120 / 18 / 21 -> 102 / 141`, 39-degree width, zero
  crossing, and conversion exactly once;
- map tests cover all four canonical display colors, stale legacy readiness,
  sector replacement, and duplicate realtime-event coalescing;
- weapon-page test covers two adjacent maximum-action models and single action
  invocation.

Authenticated Playwright smoke against the local runtime:

- `1920x1080`: 2 adjacent cards, no horizontal scroll, no overlap, every visible
  action inside its card, minimum button height 38 px;
- `3440x1440`: same result;
- secondary action menu remained inside both viewport and card width;
- `Дрейк` card badge and marker were green while derived ready;
- weapon changed `БГ -> НЕ БГ -> БГ` without F5; marker changed
  `green -> red -> green`;
- traverse values were changed temporarily; the sector path redrew;
- original database values were restored;
- final selected-FP overlay contained one sector group with no duplicate layer.

The development console still reports pre-existing Angular
`ExpressionChangedAfterItHasBeenCheckedError` messages from the application shell
when realtime counters update. They did not block this smoke and are outside this
task's map/card scope.
