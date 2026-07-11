# SE-7 — Logistics Workspace

## Route

```text
/logistics
```

## Modes

- ammunition;
- drone;
- warhead;
- all.

The mode filters:

1. storage tree;
2. inventory positions;
3. selected resource history.

## Storage visibility

Ammunition mode:

- main PAS;
- division PAS;
- battery PAS;
- fire-position ammunition stores.

Drone and warhead modes:

- drone depots only.

All mode:

- all supported depot types.

## Data sources

```http
GET /depots
GET /stock-engine/inventory/depots/:depotId
GET /stock-engine/depots/:depotId/history
```

No duplicated inventory state is stored in the frontend.

## Compatibility

Existing pages remain available:

- `/depots`;
- `/stock`;
- `/stock-movements`;
- `/drone-logistics`;
- `/planned-trips`.

The workspace is a read-oriented operational view. Existing mutation
screens remain unchanged.
