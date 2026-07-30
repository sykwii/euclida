# Release Preflight Failures

## Consolidated Blockers

All reproduced release blockers were fixed in
`b033731c7916deb27f099bb4d4387324a5cbc145`.

| Group | Reproduction/root cause | Fix | Regression proof | Status |
| --- | --- | --- | --- | --- |
| A: missing schema | Clean bootstrap/probes lacked `app_settings`, air threats and standalone weapon location/depot shape | Rerunnable migration 51 creates/guards required tables, columns, FK and index | two clean migration passes; 71 ORM probes | FIXED |
| B: legacy strict drift | Primer, deployment, zone, execution detail and stock movement legacy constraints rejected canonical rows | Migration 51 relaxes or aligns only the incompatible legacy constraints | zero ORM insert failures | FIXED |
| D/F: entity/API mismatch | Standalone weapon DTO/entity/service did not persist coordinates and ammo depot | Added canonical fields and relation without changing legacy flow | standalone suggestion ready with one kit | FIXED |
| E: realtime scope | Weapon/FP events could reach a sibling unit | Events now include canonical unit scope | sibling event count 0 | FIXED |
| G: localization | 127 damaged Cyrillic runtime fragments, including template literal segments | Corrected source literals and expanded diagnostic scan to template segments | browser mojibake 0; API reasons localized | FIXED |
| G: Leaflet production import | Home/map/recon assumed incompatible CommonJS namespace shapes; production raised `this.L.map is not a function` | One shared cycle-safe module resolver used by all three screens | 57 tests; production browser page errors 0 | FIXED |

## Non-Blocker Findings

| Finding | Classification |
| --- | --- |
| 41 DB-looser nullable declarations | Compatibility/default drift; canonical writes and ORM probes pass |
| 27 DB-only columns | Historical or generated/audit; no category D |
| Six length differences | Five DB-looser; active `item_type` values fit DB 30 |
| Four initial drone 400 responses | Correct domain validation for wrong depot; retry with drone depot passed |
| Seven generic route leak flags | False positives from validator wording |
| Leaflet CommonJS build warning | Optimization risk, runtime covered |
| Dependency advisories | Residual security review required before promotion |

## Release Policy

- RC6 must not be promoted.
- No RC7 was created or published during this audit.
- After dependency advisory review, create RC7 from the focused fix commit and
  run full release E2E against that exact immutable candidate.
- Do not merge automatically.
