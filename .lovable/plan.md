## Problem

Veckomatrisen visar nu rätt siffra i cellen (`cell.totalMinutes` läses från `staff_day_report_cache.summary_json` via `resolveStaffDayReportSummariesBatch`). Men när man klickar på en dag öppnas `StaffTimeMatrixDayDetailSheet`, som **inte** använder samma single-pipeline. Den hämtar via `useStaffTimeWeekFlow` → `get-staff-gps-week-summary`, en separat edge-funktion som bygger canonical-resultat från råa GPS-pings vid varje klick. Resultatet:

- För dagar där cachen har data men `get-staff-gps-week-summary` returnerar tomt (t.ex. om buildern faller på en kant, om pings hamnar i annat dygn, om canonical-byggaren tar timeout/error) → sheet visar "Ingen data för dagen.".
- Detta bryter mot `single-pipeline-regeln` som veckomatrisen själv följer (kommentar i `get-staff-time-week-matrix/index.ts` rad 11–22).

Cachen är redan korrekt skriven (verifierat i DB: `display_blocks_json` populerad efter förra fixen, `summary_json.payableMinutes` > 0).

## Lösning — minsta säkra fix

Detaljsheeten ska läsa **exakt samma cache-rad** som matriscellen, inte gå en parallell GPS-väg.

### Steg 1 — Exponera blocks i resolvern
`supabase/functions/_shared/staff-day-report/resolveStaffDayReport.ts`:
- Utöka `ResolvedStaffDaySummary` med `blocks: unknown[]` (innehåll från cachens `display_blocks_json`, fallback `report_candidate_blocks_json`; för submissions: `display_timeline_snapshot_json.blocks`).
- Inkludera `display_blocks_json` + `report_candidate_blocks_json` + `display_timeline_snapshot_json` i den leana SELECT-listan på rad 568.
- Fyll `blocks` i `buildSummaryFromCache` och `buildSummaryFromSubmission`.

### Steg 2 — Skicka blocks i matrix-svaret
`supabase/functions/get-staff-time-week-matrix/index.ts`:
- I `cellFromResolvedSummary`: mappa `r.blocks` → `rows: CellRow[]` (kind/label/startIso/endIso/minutes/fromLabel/toLabel) via en liten mapper (samma kontrakt som mobil-rapporten redan använder).
- Behåll `pingCount`/`gpsAvailable` som de är.

### Steg 3 — Detaljsheet läser direkt från matriscellen
`src/components/staff-time/StaffTimeMatrixDayDetailSheet.tsx`:
- Ta emot hela `StaffTimeMatrixCell` som prop istället för `{staffId, date}`.
- Rendera `cell.rows` direkt (eller via befintlig `WeekFlowDayCard` om vi mappar `MatrixCell → WeekFlowDay` lokalt) — INGET nytt nätverksanrop, INGET `useStaffTimeWeekFlow`.
- Anroparen (`StaffTimeWeekMatrixCell`) skickar redan in cellen.

### Steg 4 — Tester
- Vitest: `resolveStaffDayReport.cacheBlocks.contract.test.ts` — verifierar att resolvern returnerar `blocks` när cache har `display_blocks_json`, faller tillbaka på `report_candidate_blocks_json`, returnerar `[]` när bägge är tomma.
- Vitest: `StaffTimeMatrixDayDetailSheet.contract.test.tsx` — renderar med en cell som har `rows.length > 0` och säkerställer att inga nätverksanrop görs (mocka supabase-klienten, assert 0 invokes).
- Deno test för `get-staff-time-week-matrix` mapper: blocks-shape från cache → CellRow-shape.

### Påverkan
- `get-staff-gps-week-summary` rörs **inte**; den används fortsatt av GPS-satellitkartan.
- `useStaffTimeWeekFlow` rörs inte i denna iteration (mobilens WeekFlow-rendrering oförändrad).
- Inga DB-migrationer. Inga ändringar i Time Engine, canonical pipeline eller cache-writer.

### Verifiering efter deploy
1. Anropa `get-staff-time-week-matrix` med `weekStart=2026-06-01`, kontrollera att celler för 2026-06-01 har `rows.length > 0`.
2. I UI: klicka på en cell — sheet visar tidslinje från cachen.
3. Kör vitest-suiten.

## Filer som ändras

- `supabase/functions/_shared/staff-day-report/resolveStaffDayReport.ts`
- `supabase/functions/get-staff-time-week-matrix/index.ts`
- `src/hooks/staffTimeFlow/useStaffTimeWeekMatrix.ts` (lägg till `rows`-typen — redan deklarerad, kontroll)
- `src/components/staff-time/StaffTimeMatrixDayDetailSheet.tsx`
- `src/components/staff-time/StaffTimeWeekMatrixCell.tsx` (skickar `cell` som prop)
- Nya testfiler enligt Steg 4
