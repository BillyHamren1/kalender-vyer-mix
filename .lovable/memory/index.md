# Project Memory

## Core
- "Arbetsdag" heter **arbetspass** i UI:n. Knappen i mobilheadern är "Starta arbetspass" / "Avsluta arbetspass". Personalen får köra flera pass per kalenderdag (verkstad/event-kvällar). Tabellnamnet `workdays` behålls i DB.
- Starta arbetspass: snabb GPS auto-start vid träff; annars obligatorisk dialog.
- Personalkalendern: samma person kan läggas i flera team samma dag. Drag/Add ⇒ lägger till; "remove from team" tar bara bort den teamraden.

## Memories
- [Work shift multi per day](.lovable/memory/features/field-staff/work-shift-multi-per-day-v1.md) — Flera workday-rader per dag stöds; UI-text bytt till "arbetspass".
- [Workday timer](.lovable/memory/features/field-staff/workday-timer-v1.md) — Server-anchored dagtimer i headern.
- [Start day flow](.lovable/memory/features/field-staff/start-day-flow-v1.md) — GPS auto-start, fallback-dialog, fri text-flagga och off-site-förklaring.
- [Multi-team staff assignment](.lovable/memory/features/planning/multi-team-staff-assignment-v1.md) — Personal i flera team samma dag; available-listan exkluderar aldrig assignade; remove kan scopas till en teamrad.
- [Scanner Return (IN) Flow](.lovable/memory/features/warehouse/scanner-return-flow-v1.md) — Packlistor visas både som UT (rigdaydate) och IN (rigdowndate). Retur-scan ökar quantity_returned. Statusar delivered → returning → returned.
- [Planning Calendar Lager Column](.lovable/memory/features/planning/lager-column-bridge-v1.md) — Planeringskalenderns "Lager"-kolumn (legacy id 'transport'): internt Lagerprojekt 07–16 + staff_assignments speglas till warehouse availability.
