## Problem
GPS SAT bygger dagen via `buildCanonicalStaffDayGpsResult` (snapshot → buildDayPartition → summarizeVisibleWindow). Tid/Lön + mobilens veckovy går via `get-staff-time-week-matrix` → `resolveStaffDayReportSummariesBatch` → `staff_day_submissions` / `staff_day_report_cache` → `mapReportBlocksToSegments`. När både canonical och submission/cache finns blir det två olika sanningar för samma dag (Andis 2026-06-04).

Single-pipeline-regeln ska bli: **canonical är GPS-sanningen för rows/start/slut/minuter; submission/cache styr enbart status, submissionId, reviewComment och manuella overrides**.

## Ändringar

### 1. `supabase/functions/_shared/staff-day-report/resolveStaffDayReport.ts`
- Importera `buildCanonicalStaffDayGpsResult` + `CanonicalStaffDayGpsResult` från `../staff-gps/canonicalStaffDayGpsResult.ts`.
- Uppdatera fil-headern: "Tid/Lön får aldrig bygga egen timeline; GPS-baserade rows kommer från canonicalStaffDayGpsResult, samma som GPS SAT."
- Ny helper `projectCanonicalToResolvedSummary(canonical, meta)` som mappar `canonical.segments` → `ResolvedDayRow[]`:
  - `work` → `kind:"work"`, `travel` → `"travel"`, `private` → `"private"`, `unknown_place` → `"unknown_place"`, `gps_gap` → `"gps_gap"`, `idle` → filtreras bort.
  - `startIso`/`endIso`/`durationMinutes`/`label`/`fromLabel`/`toLabel` kopieras 1:1 från canonical.
  - `workMinutes` = `canonical.totals.workMinutes`, `travelMinutes` = `canonical.totals.travelMinutes`, `totalMinutes` = `canonical.payrollSuggestion.payableMinutes`, `startIso/endIso` från första/sista renderbara raden (inte canonical.firstIso/lastIso, eftersom de inkluderar privata pings).
- Ny intern helper `tryBuildCanonicalForDay(admin, orgId, staffId, date)` med try/catch → returnerar `null` om bygget kraschar eller saknar segment/pings. Loggar fel.
- I `resolveStaffDayReport` och `resolveStaffDayReportsBatch` / `resolveStaffDayReportSummariesBatch`:
  - Submission/cache-prioriteten är OFÖRÄNDRAD (submission > cache > empty) för status/source/submissionId/reviewComment/normalMinutes/overtimeMinutes/breakMinutes.
  - Efter projection: försök bygga canonical. Om canonical har `segments.length > 0`, **ersätt** `rows`, `startIso`, `endIso`, `workMinutes`, `travelMinutes`, `totalMinutes` med canonical-projektionen. `requested_start_at`/`requested_end_at` från submission behåller företräde över canonical.firstIso/lastIso (manuell override vinner).
  - Om canonical saknar segment/pings: behåll befintlig submission/cache-projection (manuella rapporter utan GPS fortsätter fungera).
- Batch-paralelliseras med `Promise.all` över (staff,date)-paren — `buildCanonicalStaffDayGpsResult` har egen snapshot-cache så detta är OK; vi bygger bara för de paren som har submission eller cache (inte tomma).

### 2. `get-staff-time-week-matrix/index.ts`
Ingen kodändring i logiken — den fortsätter gå genom `resolveStaffDayReportSummariesBatch`. Uppdatera headerkommentaren: "Canonical GPS-sanningen kommer via resolvern (som internt konsumerar `buildCanonicalStaffDayGpsResult`). Edge-functionen importerar fortfarande ALDRIG canonical-buildern direkt — den regeln gäller fortfarande."

### 3. Contract-tester
- `supabase/functions/_shared/staff-day-report/resolveStaffDayReport_test.ts`:
  - **Ta bort assertionen** "FORBIDDEN TABLE READ" som blockerar all annan tabell-läsning än `staff_day_submissions` / `staff_day_report_cache` (rad ~91–93, ~122–123, ~172–175). Den regeln är fel eftersom resolvern nu konsumerar canonical builder som internt läser `staff_gps_day_snapshots` + `staff_location_history`.
  - **Behåll** regeln att resolvern inte själv skriver eller läser legacy `time_reports`/`workdays`/`location_time_entries`/`travel_time_logs`/`day_attestations` (rad 162–166), men kontrollera nu statiskt mot källfilen istället för vid runtime mot mocken.
  - Lägg till nytt statiskt test: filen `resolveStaffDayReport.ts` **ska** importera `buildCanonicalStaffDayGpsResult` (positiv kontraktscheck).
  - Lägg till ett mock-test där submission + canonical-segment finns → resultatets `rows`, `workMinutes`, `travelMinutes`, `startIso`, `endIso` kommer från canonical, medan `submissionId`, `reviewComment`, `status="submitted_waiting_approval"` kommer från submission.
  - Lägg till mock-test där canonical saknar segment → fall tillbaka till submission/cache-projektion (oförändrat beteende).
- `src/components/staff-time/__tests__/StaffTimeWeekMatrix.contract.test.ts`:
  - **Behåll** rad 119 (`get-staff-time-week-matrix/index.ts` får INTE importera `buildCanonicalStaffDayGpsResult`). Det är fortsatt korrekt — bara resolvern får konsumera canonical.
  - Lägg till en ny it-block: `resolveStaffDayReport.ts` SKA importera `buildCanonicalStaffDayGpsResult` (positiv kontraktscheck) och innehålla kommentaren "GPS-baserade rows kommer från canonicalStaffDayGpsResult".

## Vad ändras INTE
- Inga schemaändringar, ingen ny tabell, ingen migration.
- `canonicalStaffDayGpsResult.ts`, `get-staff-gps-week-summary`, `get-staff-day-gps-result`, `getMobileGpsDayView` orörda.
- Submission write-path, status-mappning, approve-flow, payroll_approved, reviewComment-UI orörda.
- `staff_day_report_cache`-byggandet (backfill-funktionerna) orört — cache används fortfarande som status/breakMinutes-källa och som fallback när canonical saknar GPS.
- `display_timeline_snapshot_json` används fortfarande som fallback när canonical saknar pings.

## Verifiering
1. Kör `vitest` (lovable-exec test) på `StaffTimeWeekMatrix.contract.test.ts`.
2. Kör `supabase test edge functions` för `resolveStaffDayReport_test.ts`.
3. Manuell verifiering Andis Grinbergs 2026-06-04: jämför `/staff-management/gps-satellite-map?staffId=...&date=2026-06-04` mot Tid/Lön-veckomatris. Cellens rows ska vara identiska med GPS SAT-segmenten. "Väntar personalattest"-statusen ska finnas kvar.

## Risker
- Latency: batch-resolvern bygger nu canonical för varje (staff,date) med submission/cache. Snapshot-cachen i `getOrBuildDaySnapshot` mildrar — typiskt ≤50 ms/dag vid cache-hit. Vid kall cache kan en veckomatris × 30 personal trigga 210 builds; vi parallelliserar med `Promise.all` i batches om 8 för att hålla nere worker-CPU.
- Tester som mockar admin-clientens `.from(table)` kommer brytas av canonical-bygget (försöker läsa `staff_gps_day_snapshots`). Vi uppdaterar mockarna att svara med tomma snapshots så de faller tillbaka till submission-projektionen — det är samma path som "manuell rapport utan GPS"-fallet.