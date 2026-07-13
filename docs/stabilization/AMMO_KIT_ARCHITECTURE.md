# AMMO-1 — Canonical Shot Kit Model

## Scope

AMMO-1 makes `ShotConfiguration` the canonical `Комплект пострілу` model for active create/update/suggestion flows while preserving:

- legacy `zones`, `shell_compatible_charges`, `shell_compatible_fuzes` tables;
- historical snapshots;
- completed `ServiceOrder` records;
- legacy read paths where old data still exists.

## Canonical model

Active `ShotConfiguration` now uses:

- `weaponModelId`
- `name`
- `shellId`
- `fuzeId`
- `primerId`
- `zoneNumber`
- `maxRangeM`
- `isActive`
- `note`
- `charges[]` with:
  - `chargeId`
  - `quantityPerShot`
  - `accountingUnit`
  - `sortOrder`

`zoneId` remains in schema only for compatibility/backfill. Active backend and frontend flows are moved to `zoneNumber`.

## Migration

`database/init/40_shot_configurations.sql` now:

- keeps legacy schema intact;
- adds `shot_configurations.zone_number` if missing;
- adds `shot_configuration_charges.accounting_unit` if missing;
- backfills `zone_number` from `zones.zone_number`;
- backfills `accounting_unit` from `charges.charge_kind`;
- keeps legacy `zone_id` nullable;
- marks legacy auto-converted configurations inactive;
- is written to be rerunnable on partially migrated databases.

## Activation rules

Shot kit activation now requires:

- weapon model;
- shell;
- at least one charge;
- fuze;
- primer;
- `zoneNumber`;
- `maxRangeM > 0`.

Incomplete legacy rows remain editable drafts and cannot be activated.

## Suggestions

Fire-position suggestions now use active shot kits and:

- filter by `weaponModelId`;
- require `distance <= maxRangeM`;
- calculate available full shots from shell, fuze, primer and every charge component;
- return rejection reasons for missing components;
- no longer depend on active `zone` relation loading.

## Frontend

Active operator flows now say `Комплекти пострілу` and use:

- `zoneNumber` input instead of zone selection;
- explicit charge rows with quantity and `piece|module`;
- service-order suggestion cards showing zone number from the kit.

Legacy zones routes and tables are still preserved for compatibility.

## Tests

Added backend coverage for:

- mixed charge composition with persisted accounting units;
- activation rejection for incomplete legacy kits;
- accounting-unit validation for modular charges.

## Remaining debt

- legacy `ServiceOrder` completion still keeps compatibility fallback paths for historical orders;
- navigation cleanup for old zones references should be finished together with broader reference-menu cleanup if more legacy screens are retired;
- focused suggestion/execution tests can be expanded with stock availability matrix cases.
