# OPS Polish: Maintenance and Shot Kits

Date: 2026-07-14

## Scope

Fixed two runtime gaps without schema, route, DTO semantics, or UI redesign:

- weapon maintenance UI/state actions;
- shot-kit availability after selecting a fire-position suggestion.

## Maintenance UI

Routes verified:

- `POST /weapon-systems/:id/maintenance/open`
- `POST /weapon-systems/:id/maintenance/start`
- `POST /weapon-systems/:id/maintenance/complete`
- `POST /weapon-systems/:id/maintenance/cancel`
- `POST /weapon-systems/:id/readiness/confirm`

Open maintenance payload now supports the existing duration path and the UI-friendly explicit completion date:

```json
{
  "reason": "breakdown|scheduled|inspection|other",
  "description": "optional text",
  "expectedCompletedAt": "2026-07-15T08:30:00.000Z"
}
```

State-driven UI actions:

- no active maintenance: `Відкрити ТО/ремонт`;
- `opened`: `Розпочати`, `Скасувати`;
- `in_progress`: `Завершити`, `Скасувати`;
- `completed`: `Підтвердити БГ`;
- `cancelled`: new maintenance can be opened.

The weapon card now uses one `ТО / ремонт` modal, localized labels, active maintenance details/history, and safe backend 4xx messages.

## Shot Kit Suggestions

Root causes fixed:

- suggestions still used legacy weapon placement first; active flow now resolves the arrived weapon by `currentFirePositionId + deploymentStatus='at_fire_position'`, with legacy placement only as compatibility fallback;
- active maintenance filtering treated SQL `NULL` as excluded, so ready weapons without maintenance could disappear from suggestions;
- inactive/incomplete/out-of-range shot configurations disappeared without a reason.

Canonical kit filters:

- weapon model matches the canonically arrived weapon;
- kit is active;
- shell, fuze, primer, zone number, and charges are complete;
- `maxRangeM >= target distance`;
- stock can satisfy the planned shot count.

When no usable kits exist, the API now returns explicit Ukrainian rejection reasons instead of an empty unexplained variant list. The UI shows `Комплекти пострілу недоступні` with the reason. Selecting a new FP refreshes variants once and clears incompatible kit selection through the existing page flow.

## Changed Files

- `backend/src/service-orders/service-order-suggestions.service.ts`
- `backend/src/service-orders/service-order-suggestions.service.spec.ts`
- `backend/src/weapon-systems/dto/open-weapon-maintenance.dto.ts`
- `backend/src/weapon-systems/weapon-systems.service.ts`
- `backend/src/weapon-systems/weapon-systems.service.spec.ts`
- `frontend/src/app/features/service-orders/service-orders-page/service-orders-page.html`
- `frontend/src/app/features/service-orders/service-orders-page/service-orders-page.ts`
- `frontend/src/app/features/weapon-systems/weapon-systems.service.ts`
- `frontend/src/app/features/weapon-systems/weapon-systems-page/weapon-systems-page.html`
- `frontend/src/app/features/weapon-systems/weapon-systems-page/weapon-systems-page.css`
- `frontend/src/app/features/weapon-systems/weapon-systems-page/weapon-systems-page.ts`
- `frontend/src/app/features/weapon-systems/weapon-systems-page/weapon-systems-page.spec.ts`

## Live Smoke

Backend ran locally on port `3011`.

Smoke data:

- order: `22593b2a-63f6-4bd8-94c5-dfd4f720f7e9`;
- fire position: `Вівас` (`f8f0bde4-41ad-48c4-a1b0-70d335925935`);
- shot kit: `короткий` (`dfb531da-99ee-4a89-b1f7-6ea02175b7ce`);
- battery delivery: `3f50fc87-02be-4994-95d9-44e07f5c2d55`.

Result:

- suggestions returned `Вівас` with kit `короткий`;
- selecting FP persisted `selectedShotConfigurationId=dfb531da-99ee-4a89-b1f7-6ea02175b7ce`;
- sending created battery delivery;
- battery accepted delivery;
- service order started with the same selected shot kit.

## Verification

- Backend build: passed.
- Backend tests: passed, 11 suites / 64 tests.
- Frontend build: passed.
- Frontend tests: passed, 7 files / 16 tests.

## Remaining Debt

- Existing compatibility routes and legacy fire-position assignment fields remain by design.
- Some older backend strings are mojibake in untouched code paths; this task only avoided adding new mojibake and localized new UI labels.
- The UI still relies on the existing page refresh method after mutations; realtime remains the standard update path, with one local refresh used as fallback.
