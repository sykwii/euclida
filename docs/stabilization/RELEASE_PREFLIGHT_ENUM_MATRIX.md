# Release Preflight Enum Matrix

Static extraction found one declared TypeScript enum, 109 union-like contracts,
53 `IsIn` validators, and 21 frontend option/label maps. Active contracts below
were cross-checked against SQL checks and exercised through API/ORM probes.

| Contract | Backend/DTO | DB | Frontend | Result |
| --- | --- | --- | --- | --- |
| ServiceOrder status | draft, sent, accepted, in_progress, completed, cancelled, rejected | matching check | matching state/action maps | PASS |
| Delivery status | new, viewed, accepted, rejected | matching check | matching labels | PASS |
| Execution status | draft, posted, cancelled | matching check | matching journal labels | PASS |
| Execution purpose | barrel_warmup, adjustment, main_fire, additional_fire, other plus accepted aliases | migration 50 aligned | matching active choices | PASS |
| Readiness | combat_ready, not_combat_ready | matching checks | БГ/НЕ БГ labels | PASS |
| Maintenance status | requested/opened, in_progress, completed, cancelled where applicable | matching checks | matching actions/labels | PASS |
| FP restriction reason | explicit block/threat plus derived weapon/no-weapon reasons | stored compatibility fields accept active values | localized reason mapper | PASS |
| Stock operation | consumption/transfer/correction/reversal and posted lifecycle | matching checks | matching operation labels | PASS |
| Depot type | ammo, drone and active logistics types | matching checks | matching selectors | PASS |
| Weapon/system type | artillery, mortar, mlrs, self_propelled and active domains | compatible checks | matching options/labels | PASS |
| Drone group/type | active model and warhead values | matching checks/length | matching options | PASS |
| Shot configuration | active/inactive lifecycle and component accounting | matching constraints | matching state | PASS |
| Accounting unit | piece/module/unit and active component units | matching checks | localized unit labels | PASS |
| User role/scope | admin/operator; main/division/battery and active specialized scopes | matching checks | matching options/guards | PASS |
| Notification | active type/severity/read state | schema accepts emitted values | matching overlay/list mapping | PASS |

No active runtime value violated a SQL check in the clean-schema ORM or API
flows. No raw enum was observed in the browser smoke.

Raw extraction:
`C:\Users\НЗ\euclida-staging-tools\preflight-all\artifacts\code-enum-contracts.json`.
