
# Spegla GPS-dagens tidslinje i mobilens Time

## Problem idag
Mobilens Time-flik (`TimeReportTab` → `UserDayList`) läser `staff_day_report_cache` via `get-mobile-staff-time-report-period`. Cachen är tom för dagar utan inskickad rapport → alla dagar visas som "Ej rapporterad" trots att GPS-pings finns.

Web-vyn `/staff-management/gps-map` (`StaffGpsWeekPanel` + `useStaffGpsWeekSummary`) bygger däremot en GPS-tidslinje per dag direkt från `staff_location_history` (pings → `buildPlaceVisits` → places + minuter).

Användaren vill att **GPS-tidslinjen är förslagsunderlag** för tidrapporten i appen — alltid synlig, alltid grund.

## Mål
1. Time-flikens dagslista visar GPS-härledd arbetstid (start–slut, places, minuter) även när ingen rapport är inskickad.
2. Användaren ser ett **förslag** per dag med 3 åtgärder:
   - **Godkänn som det är** → skapar `time_reports` 1:1 från GPS-tidslinjen.
   - **Justera totalen** (start, slut, rast).
   - **Justera per projekt** — fördela tid mellan föreslagna projekt eller assigna till annat projekt (sökbar lista över aktiva projekt/lager).
3. Inskickade dagar fortsätter visas via befintlig snapshot (oförändrat).
4. Inga befintliga affärsregler ändras: GPS = förslag, `time_reports` = sanning (Time Data Authority).

## Arkitektur

Robust väg = **server-driven spegling**. Mobilen får ALDRIG köra tunga `staff_location_history`-queries direkt (skulle bryta Mirror-Only-policyn och slå hårt på batteri).

### Ny edge function: `get-mobile-staff-gps-day-suggestion`
- Auth: `_shared/staff-auth.ts` (samma dual-auth som övriga snapshot-funktioner).
- Input: `{ date: 'YYYY-MM-DD' }` eller `{ from, to }` för veckovy.
- Logik: Återanvänder Deno-porten av `buildGpsDayTimeline` + `resolveWorkTargets` + `interpretDayTimeline` som redan finns i `supabase/functions/_shared/time-engine/`. Läser `staff_location_history`, `projects`, `large_projects`, `organization_locations`, BSA för dagen.
- Output per dag:
  ```
  {
    date, suggestedStartIso, suggestedEndIso, suggestedBreakMinutes,
    suggestedWorkMinutes, suggestedTravelMinutes,
    perTarget: [{ targetKind, targetId, name, minutes, confidence }],
    timeline: GpsTimelineSegment[],   // för minikartan/preview
    hasGps: boolean,
    reportStatus: 'empty'|'open'|'draft'|'submitted',  // joinas in från staff_day_submissions
  }
  ```
- Inga DB-skrivningar.

### Veckovy
- Ny hook `useStaffGpsWeekSuggestion(anchor)` som anropar funktionen för 7 dagar (eller en enda `from/to`-batch).
- `useStaffTimeReportPeriod` används kvar för inskickade summor (oförändrat). De två merges i UI: GPS-förslag visas alltid, snapshot vinner när `reportStatus === 'submitted'`.

### UI (mobil)
- `UserDayList` får ny rad-variant `SuggestionRow`:
  - Header: dag + förslagets `HH:MM–HH:MM (Xh Ym)`.
  - Lista över föreslagna projekt med minuter (samma layout som idag).
  - Primärknapp: **"Godkänn"** → öppnar `ApproveSuggestionSheet` (bekräfta totalen, rast, fördelning).
  - Sekundärlänk: **"Justera"** → öppnar befintlig `StaffDayDetailSheet` förinifylld med GPS-förslag istället för tom.
- `StaffDayDetailSheet` får två nya block:
  - **Total**: justera start/slut/rast (befintliga fält, förifyllt från förslag).
  - **Per projekt**: lista med minuter per förslag + `+ Lägg till projekt` (söker i projects/large_projects/locations i samma org, samma reslolver som start-flow).
  - "Spara" → POST till `mobile-app-api action=submit_day_from_suggestion` med `{ date, totals, allocations: [{targetKind, targetId, minutes}] }`. Funktionen skriver `time_reports` (en per allocation) + `staff_day_submissions` via befintlig submit-pipeline.

### Inga ändringar i
- `buildGpsDayTimeline` / `interpretDayTimeline` / Time Engine-policy (återanvänds).
- Mapbox-rendering, ruttlogik.
- Admin /staff-management/time-reports.
- Workday-system (redan borttaget).
- `staff_day_report_cache`-spegling för inskickade dagar.

## Filer som skapas/ändras

### Nya
- `supabase/functions/get-mobile-staff-gps-day-suggestion/index.ts`
- `supabase/functions/get-mobile-staff-gps-day-suggestion/index.test.ts`
- `src/hooks/useStaffGpsDaySuggestion.ts`
- `src/hooks/useStaffGpsWeekSuggestion.ts`
- `src/components/mobile-app/time/SuggestionRow.tsx`
- `src/components/mobile-app/time/ApproveSuggestionSheet.tsx`
- `src/components/mobile-app/time/PerProjectAllocationEditor.tsx`
- `src/test/mobileGpsSuggestionMirror.contract.test.ts` — låser att mobilens förslag är 1:1 med admin GPS-vyn för samma dag.

### Ändras
- `src/components/mobile-app/time/TimeReportTab.tsx` — merge förslag + snapshot, default veckovy oförändrad.
- `src/components/mobile-app/time/UserDayList.tsx` — använd `SuggestionRow` när `reportStatus !== 'submitted'`.
- `src/components/mobile-app/time/StaffDayDetailSheet.tsx` — förifyll från förslag, lägg till per-projekt-editor.
- `supabase/functions/mobile-app-api/index.ts` — ny action `submit_day_from_suggestion`.
- `mem://constraints/mobile-time-app-mirror-only-v1` — uppdateras: mobil får visa GPS-FÖRSLAG (read-only spegling av admin GPS-tidslinje), fortfarande ingen egen tolkning.

## Verifiering (körs efter implementation)
1. `bunx vitest run src/test/mobileGpsSuggestionMirror.contract.test.ts`
2. `bash scripts/test-time-reporting.sh` (befintlig kvalitetsgrind — får ej regrediera).
3. `supabase--test_edge_functions` för nya funktionen.
4. Manuell preview-check på `/m/report` med ett konto som har GPS-pings → veckans dagar ska visa start–slut + places istället för "Ej rapporterad".

## Svar på frågan "behöver appen byggas om?"
Nej — appens skal (Capacitor/iOS/Android) behöver inte byggas om. Allt är web-kod + en ny edge function. Den deployas och syns direkt i preview och i den publicerade web-appen som mobilen laddar.
