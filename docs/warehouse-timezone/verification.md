# Warehouse import timezone correction

## Contract
All six imported moments are Stockholm wall times, persisted as explicit UTC instants:
packing (rig−4, 08–11), delivery (rig, 07–09), event (event day, 09–17), return (rigdown, 17–19), inventory (rigdown+1, 08–10), unpacking (rigdown+1, 10–12).
Multiple rigdown dates use the offset on each moment's actual date. Existing frontend manager planning has different return-slot rules; this change deliberately preserves those plans and does not replace their business rules with import defaults.

Import suggestions are now insert-only with ON CONFLICT DO NOTHING. Recovery, reconfirmation and concurrent reimport cannot reset existing times, viewed/manual flags, resources, or approved task links. Existing source-change review is not an authorization to reschedule.

## Existing data: read-only production evidence (2026-10-14 UTC)
The deployed import (version 1296) matches the reviewed main source apart from trailing whitespace. timestamptz columns currently receive timezone-free values. The assignment update trigger correctly uses Europe/Stockholm.

Read-only SQL found 3,154 rows matching the legacy UTC-shaped defaults, including 224 future rows: delivery 25, event 28, inventory 49, packing 24, return 49, unpacking 49. Another 13 logistics rows are explicitly protected manual plans (12 packing, 1 return); internal tasks are excluded. No linked concrete warehouse assignments exist in this database at audit time, so zero mismatches is not evidence of a live worker E2E pass.

The old importer reset ownership flags. Matching default hours, false flags, or unchanged timestamps are not enough to establish that staff never approved a plan. No historical rows are changed by this release. `scripts/warehouse/timezone-audit.sql` classifies them read-only. `timezone-reviewed-repair.sql` provides a default-rollback, reviewed-ID correction with tenant/snapshot checks, row locks, protection against concurrent assignment creation, exact six-rule matching and all-or-nothing conflict handling. Applied batches require independent provenance and durable before/after evidence. Historical work is excluded from automatic correction.

## Validation
26 initial time/import/personnel tests passed; expanded warehouse/mobile/personnel suites: 62 tests in 10 files. Additional America/Los_Angeles run: 19 time/import tests passed. Full application TypeScript and production frontend build passed (existing bundle-size warning). GitHub adds the same suites in UTC, Stockholm and Los Angeles.

The live calendar/personnel/My day visual check and correction of reviewed existing rows remain separate acceptance gates. This is not a claim that the existing legacy rows have been repaired.
