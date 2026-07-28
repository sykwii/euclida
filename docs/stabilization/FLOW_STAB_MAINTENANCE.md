# FLOW-STAB-MAINT-1: Maintenance State and Weapon Archival

## Canonical maintenance state

An active maintenance is the latest `weapon_maintenances` row whose status is
`opened` or `in_progress`. Completed and cancelled rows are history.

`weapon_systems.maintenance_status` is a synchronized cache only. It is not
used to authorize maintenance actions, readiness, executor suggestions, or
firing. API responses expose:

- `activeMaintenance`: the canonical active row or `null`
- `maintenanceStatus`: the active row status or `null`
- `maintenances`: complete history

The shared `getActiveMaintenance(weaponId, manager?)` helper is used by
maintenance transitions, readiness confirmation, ServiceOrder firing, and the
execution engine.

## Transitions

| Current active state | Allowed actions |
| --- | --- |
| none | open |
| `opened` | start, cancel |
| `in_progress` | complete, cancel, extend |
| `completed` / `cancelled` | history only; a new maintenance may be opened |

Completion and cancellation clear the cache. Completion keeps the weapon
`not_combat_ready`; only the explicit readiness confirmation can restore
`combat_ready`.

## Repair

Run from the backend database account:

```text
backend/scripts/flow-stab-maintenance-repair.sql
```

The script is rerunnable. It:

1. Adds archival columns if missing.
2. Stops if duplicate active maintenance rows need manual resolution.
3. Synchronizes every cache from the latest canonical active row and reports
   `synchronized_weapon_count`.
4. Adds a partial unique index that permits at most one active row per weapon.

It does not fabricate maintenance history or change readiness.

## Deletion and archival

Permanent deletion is allowed only when the weapon has no historical
references. A referenced weapon returns HTTP 409 with:

`СГ використовується в історії ВГЗ і не може бути видалена. Архівуйте її.`

`POST /weapon-systems/:id/archive` records `isArchived`, `archivedAt`, and
`archivedByUserId`. Archived weapons are excluded from active lists,
ServiceOrder suggestions, and canonical FirePosition assignment lookups while
their historical relations remain readable.

## Verification

Automated verification:

- backend focused suite: 24 tests passed
- backend full suite: 99 tests passed
- frontend focused suite: 6 tests passed
- frontend full suite: 46 tests passed
- backend and frontend production builds passed

Authenticated live smoke used the current historically referenced weapon
`Дід` (`738e0a9b-65df-4e1a-8fe3-f51d667f1133`) and verified:

1. Repaired API state had no stale active maintenance.
2. `opened -> in_progress -> completed` persisted and reloaded correctly.
3. Completion did not restore readiness.
4. Explicit readiness confirmation restored `combat_ready`.
5. Permanent deletion returned the exact HTTP 409 message.
6. Archival removed the weapon from the active list.
7. The ServiceOrder delivery reference remained intact.

The smoke script restores the tested weapon's operational and archival fields
and removes its temporary maintenance row after verification:

```text
node backend/scripts/flow-stab-maintenance-smoke.js
```
