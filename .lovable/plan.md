## Problem

`/m/report` (mobilens Tidrapport) visar 90h 17m för Markus 11 maj. Bild 2 (admin Gantt/StaffDayTimelineCard) visar samma dag som ~6h 20m rigg + transporter + granska — det är den korrekta vyn, byggd från **Time Engine-cachen** (`staff_day_report_cache.report_candidate_blocks_json`).

`/m/report` läser idag från en **helt annan väg**:

```
TimeReportTab (vecka)
  → useStaffTimeReportPeriod
  → get-staff-time-report-period  ← KÄLLA SOM ÄR FEL
  → fetchRangeRows (workdays/time_reports/travel/LTE)
  → buildDayRangeSnapshots → summarizeSnapshots
  → grossWorkdayMinutes = workday.started_at..ended_at
```

Markus har en gammal/öppen workday-rad som spänner ~90h över flera dygn. `clipIntervalToDayWindow` skulle klippa den, men efter klippningen returneras hela det överlappande fönstret för 11 maj — och det är fortfarande felaktigt eftersom workday-spannet aldrig speglar verklig arbetstid (Time Engine vet detta — admin-vyn visar bara ~6h).

Den **korrekta källan finns redan**: `get-mobile-staff-day-report` läser `staff_day_report_cache` (samma motor som admin) och returnerar `MobileDayReport` med `summary.workMinutes`, `summary.travelMinutes`, `summary.payableMinutes`, `segments[]` osv. Den används idag bara av "Idag"-tabben via `useStaffDayStatusViaMobileReport`.

## Lösning

Byt hela `/m/report` till att enbart läsa Time Engine-cachen — samma data som driver bild 2. Ingen lokal aggregering, inga workday-baserade totals.

### Steg 1 — Ny period-källa som speglar Time Engine-cachen

Skapa edge function `get-mobile-staff-time-report-period` (vecka/månad) som:

1. Tar `{ staffId, kind: 'week'|'month', startDate, endDate }`.
2. Läser `staff_day_report_cache` för alla dagar i intervallet (en query, `in('date', ...)`, senaste `built_at` per dag).
3. Läser `staff_day_submissions` för intervallet (för status: needs_attest / attested / approved).
4. Per dag bygger via befintliga `buildMobileSnapshot` + `mapReportBlocksToSegments` (delad `_shared/mobile/`) → samma `MobileDayReport.summary` som `/m/report` "Idag"-tabben.
5. Mappar varje dag till en ny `MobilePeriodDay`:
   - `grossWorkdayMinutes` = `summary.workMinutes + travelMinutes`
   - `breakMinutes` / `payableMinutes` = direkt från `summary`
   - `projectMinutes` / `warehouseMinutes` / `transportMinutes` / `otherPlaceMinutes` = härleds från `segments[]` (samma kind som mappern redan ger).
   - `status`: `empty` om inga block, `open` om workday öppen, annars härleds från submission (`approved`/`attested`/`needs_attest`).
   - `actionsCount` = antal `segments` med `kind === 'needs_review'`.
6. Returnerar `{ period, totals, days, blockers, status, lastUpdatedAt }` i samma form som dagens `useStaffTimeReportPeriod` förväntar (samma shape som `StaffPeriodDaySummary`/`StaffTimeReportPeriodTotals`) så frontend-typer inte behöver ritas om.

Inga DB-skrivningar, inga ändringar i Time Engine, ingen aggregering av råtabeller.

### Steg 2 — Koppla om frontend-hookarna

- `useStaffTimeReportPeriod`: byt `callStaffSnapshotFunction('get-staff-time-report-period', …)` → `'get-mobile-staff-time-report-period'`. Behåll signatur, return-typ, realtime-prenumeration (men byt tabell till `staff_day_report_cache` + `staff_day_submissions`).
- `useStaffMonthStatus` (driver Kalender-tabben): samma sak — peka på den nya funktionen i `kind: 'month'`-läge (eller en parallell `get-mobile-staff-month-status` som internt anropar samma kod).
- `TimeReportTab` "Dag"-vyn (`useStaffDaySnapshot`/`get-staff-day-status`): byt till `useMobileStaffDayReport` (som redan finns). Mappa `MobileDayReport.summary` → de fält som `UserTimeSummaryCards` förväntar.

### Steg 3 — Pensionera de gamla källorna i mobilen

- `get-staff-time-report-period`, `get-staff-month-status`, `get-staff-day-status` används fortfarande på admin-sidan (StaffDayDetailSheet, etc.) — **rör inte dem där**. Vi byter bara mobilens hooks så att `/m/report`, `/m/profile`-månadsrutan och `MobileTimeHistory` enbart går genom Time Engine-cachen.
- `StaffDayDetailSheet` (öppnas när man tappar en dagrad i `/m/report`) — byt dess `useStaffDaySnapshot` till `useStaffDayStatusViaMobileReport`-adaptern som redan existerar, så även detaljvyn matchar bild 2.

### Steg 4 — Verifiering

1. Hämta `get-mobile-staff-time-report-period` för Markus, vecka 2026-05-11 → 2026-05-17, och bekräfta att 11 maj returnerar ~6h 20m + transport, INTE 90h.
2. Ladda om `/m/report` i preview, kontrollera att kortet "MÅN 11 maj" visar samma siffror som admin-bild 2.
3. Öppna dagdetaljen och verifiera att tidslinjen är samma block som admin (ARBETE / GRANSKA / TRANSPORT / RIGG).

## Tekniska noter

- `staff_day_report_cache` är redan källan för `get-mobile-staff-day-report` och har korrekta blocken för Markus 11 maj (annars hade admin-vyn också visat 90h).
- 90h-felet kommer uteslutande från `grossWorkdayMinutes = workday.duration` i `summarizeSnapshots`/`buildStaffDaySnapshot`. När vi tar siffror från cache-summaryn försvinner det helt — vi tittar aldrig på `workdays.started_at..ended_at` igen för mobilens tidrapport.
- Submission/attest-kopplingen behålls via `staff_day_submissions` så `needs_attest` / `attested` / `approved`-statusarna är intakta.
- Inga migrationer, inga schemaändringar, ingen UI-ombyggnad. Endast ny edge function + omkopplade hooks.

## Filer som rörs

Nya:
- `supabase/functions/get-mobile-staff-time-report-period/index.ts`

Ändrade:
- `src/hooks/useStaffTimeReportPeriod.ts` (peka på ny edge function + realtime-tabell)
- `src/hooks/useStaffMonthStatus.ts` (samma sak)
- `src/components/mobile-app/time/TimeReportTab.tsx` (Dag-vyn → `useMobileStaffDayReport`)
- `src/components/mobile-app/time/StaffDayDetailSheet.tsx` (byt hook till `useStaffDayStatusViaMobileReport`)

Orörda:
- All admin-kod (`get-staff-day-status`, `get-staff-time-report-period`, `get-staff-month-status` lever vidare för admin).
- Time Engine, `buildReportCandidateBlocks`, transport-tröskeln, GPS, mobile-app-api, time_reports-skrivvägen.
