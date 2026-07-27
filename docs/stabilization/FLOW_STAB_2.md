# FLOW-STAB-2 stabilization

Date: 2026-07-27

## Scope

FLOW-STAB-2 stabilizes the active ServiceOrder UI without changing the schema,
routes, DTO lifecycle, C2 workspace, or notification architecture.

## Contextual workflow action

The expanded order derives one `primaryAction` view model with:

- `type`
- `label`
- `visualVariant`
- `disabled`
- `disabledReason`
- `loading`
- `handler`

The active progression is:

`Підібрати виконавця -> Обрати комплект -> Відправити на ПУВБ -> Прийняти -> Почати виконання -> Додати/Продовжити виконання -> Завершити ВГЗ`

Only an action executable by the current role and scope is rendered. Terminal
orders have no primary action. The action is in a fixed-width right column of the
expanded row; map and destructive operations remain secondary.

Executor choice is local until send. Suggestions are deterministic
weapon-system candidates with a nullable fire position, required weapon ID,
weapon callsign/model, readiness, distance, stock sufficiency, compatible kits,
and rejection reasons. Changing the weapon clears an incompatible kit. A sole
compatible kit is preselected; missing kits retain the manual composition path
with an exact reason.

## Runtime reliability

All workflow mutations use in-flight guards. Send first persists the selected
weapon and kit through the existing selection endpoint, then uses the existing
send endpoint. Backend state remains authoritative and successful mutations use
targeted reloads or mission realtime reconciliation.

Journal loads are versioned so an older response cannot erase a newly created
draft. Draft creation also reconciles its returned record immediately. Validate,
post, cancel, and completion are guarded against repeat clicks.

Completion reads posted execution records, derives `actualQuantity` from their
sum, and does not render or submit a second ammunition form. Repeated post and
complete calls reuse the existing stock operation and do not write stock twice.

## Realtime

The page reconciles ServiceOrders for `missions` events only. Stock, map, and
analytics events do not reload the page. Reconnect performs one reconciliation
load. Stable row tracking preserves the expanded order, local executor/kit
selection, and unrelated open UI.

## Row action overlay

The row menu uses Angular CDK Overlay at the document root. It:

- opens below the trigger and flips above when space is insufficient;
- stays within a 12 px viewport margin;
- uses one opaque 184 px menu above rows and below notifications/modals;
- closes on backdrop click, Escape, navigation, or when its anchor leaves the
  viewport;
- returns focus to the trigger and never shifts a row.

The row entrance animation is 120 ms and does not retain a transform after it
finishes.

## Verification

Automated verification:

```text
frontend focused tests: 1 file, 11 tests passed
frontend development build: passed
backend focused regression: 3 suites, 19 tests passed
backend build: passed
```

Authenticated live smoke used real local JWTs and database IDs:

```text
runId: 1785163829469
orderId: 2f572e4c-c300-4889-9cde-3bc6abf70656
executionRecordId: ef41b841-c374-4ed7-a572-163d6f0ec1ab
operatorId: ed39f8be-d1cd-4338-bf5e-96885ab561bb
actualQuantity: 1
stockOperationId: 2ea8f76d-6eed-4f12-81d0-0d60f8c9e2cc
```

The live run completed draft, executor and kit selection, send, recipient
accept, start, execution draft, validate, post, repeated post, and completion.
It proved one stock operation and four movement rows: one shell, four charge
units, one fuze, and one primer. Repeated post was idempotent and completion used
the posted journal without a second write-off form.

Overlay smoke passed at exact `1920x1080` and `3440x1440` viewports with eight
row triggers. It verified below/above placement, root rendering, horizontal
containment, single-open behavior, outside/Escape close, and close after the
anchor leaves the viewport.

Screenshots:

- `flow-stab-2-1920x1080.png`
- `flow-stab-2-3440x1440.png`
