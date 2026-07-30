# SECURITY DEPENDENCY AUDIT

Date: 2026-07-30

## Production Result

| Package tree | Before | After | High | Critical |
| --- | ---: | ---: | ---: | ---: |
| Backend production | 12 total (1 Low, 2 Moderate, 9 High) | 1 Moderate | 0 | 0 |
| Frontend production | 26 total (3 Low, 5 Moderate, 17 High, 1 Critical) | 0 | 0 | 0 |

Evidence:

- `C:\Users\НЗ\euclida-staging-tools\security-rc7\logs\backend-npm-audit-before.json`
- `C:\Users\НЗ\euclida-staging-tools\security-rc7\logs\final-regression-backend-audit-production.json`
- `C:\Users\НЗ\euclida-staging-tools\security-rc7\logs\frontend-npm-audit-before.json`
- `C:\Users\НЗ\euclida-staging-tools\security-rc7\logs\final-regression-frontend-audit-production.json`

Package manifests and lockfiles were updated together. Clean `npm ci`, build, and full test runs were executed from the isolated clean staging source after the updates.

## Remaining Moderate

The backend production audit reports one Moderate advisory inherited through the TypeORM migration-generation CLI path. The affected path requires a local privileged command and is not imported or exposed by the running API/WebSocket process. It is accepted as AR-001 for RC7 and should be removed when the TypeORM/tooling upgrade can be validated separately.

## Development Tree

The full backend dependency tree still reports development-toolchain advisories (1 Moderate and 26 High in the recorded clean install output). They are not present in the production-omitted runtime tree. This is accepted as AR-002, not silently waived:

- CI/build hosts must remain isolated from untrusted input.
- Production images must install production dependencies only.
- Toolchain updates should be handled in a focused follow-up with clean build/test evidence.

## Build Warning

The frontend production build retains the known Leaflet CommonJS optimization warning. This is AR-003 and is not a vulnerability finding.

## Verdict

PASS for the production RC7 gate: backend and frontend both have zero High and zero Critical production advisories.
