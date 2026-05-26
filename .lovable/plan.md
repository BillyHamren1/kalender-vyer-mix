## Mål

Gör veckopanelen i `StaffGpsSatelliteMap` (komponenten på bilden) ren och attesterbar. Ingen ny motor, inga DB-skrivningar, ingen ny edge-funktion — bara presentations-filter + tydlig märkning.

## Var det sker

Panelen på skärmen kommer från:

```
StaffGpsSatelliteMap.tsx
 └─ StaffGpsWeekPanel.tsx
     └─ StaffGpsDayRow.tsx       ← raderna "Resa game fair → game fair", "Okänd plats" etc.
         ↑ data: useStaffGpsWeekSummary
              ↑ edge: get-staff-gps-week-summary  (GPS-partition, INTE display_blocks_json)
```

Datakällan är GPS-partition. Att koppla om hela hooken till `staff_day_report_cache.display_blocks_json` är **inte** "minsta möjliga ändring" — det kräver ny RPC och payload-omdesign. Vi gör det på presentationsnivå istället, vilket räcker för det användaren beskriver.

## Ändringar

### 1. `src/lib/staff-gps/reportRowFilter.ts` (NY, ~80 rader, ren funktion)

Två exports:

- `toReportRows(segments: DaySegment[]): DaySegment[]` — filter + merge:
  - Släpper igenom endast `work` (och ev. `travel` om `fromLabel !== toLabel` OCH `minutes >= 5`).
  - Filtrerar bort: `gps_gap`, `unknown_place`, `idle`, `private`, samt `travel` där `fromLabel === toLabel` eller `minutes < 5`.
  - Kapar leading/trailing icke-arbete: tar bort allt före första `work` och efter sista `work` (löser 02:00–08:58-natten på tisdag).
  - Slår ihop kontigt eller "sandwich"-uppdelade `work`-block med samma target-label (project/booking/warehouse). Mellanliggande gps_gap / unknown_place / same-target-travel absorberas i totalen `[start, end]`, och **dolda minuter räknas inte** in i `workMin` för raden — workMin = summa av faktiska work-segments.
- `summarizeReportRows(rows, originalSegments)` → `{ workMin, travelMin, hiddenEvidenceMin, hiddenEvidenceKinds, mergedSameTargetRowsCount, reportSourceUsed: 'gps_partition_filtered' }`.

Pure, ingen DOM, ingen DB → enkel vitest.

### 2. `src/lib/staff-gps/__tests__/reportRowFilter.test.ts` (NY)

Testfall direkt ur användarens beskrivning:

- **Måndag 25/5-sandwich**: 5 segment "game fair / travel→samma / game fair / travel→samma / game fair" → 1 rad `Swedish game fair 10:54–22:53`, workMin = summan av de tre work-segmenten.
- **Tisdag 26/5-natt**: "unknown_place 02:00–08:58, work FA 08:58–09:49, travel→game fair, work game fair 11:00–19:29, travel→FA, work FA 20:02–20:08, private 20:09–20:28" → rader: FA 08:58–09:49, Resa FA→game fair, game fair 11:00–19:29, Resa game fair→FA. Inget natt-block, inget private, ingen 6-minuters-FA-svans (mergeas in i föregående resa eftersom samma destination).
- Inget block med `fromLabel===toLabel` får överleva.

### 3. `src/components/staff/StaffGpsDayRow.tsx` (EDIT, ~30 rader rört)

- Acceptera ny prop `mode: 'report' | 'evidence'` (default `'report'` för bakåtkomp).
- I `'report'`-läge: ersätt nuvarande `segments`-list med `toReportRows(summary.segments)`. Använd `summarizeReportRows` för översta dag-sammanställningen (Arbete / Resa). Visa **inte** Okänt/GPS-glapp/Privat i den raden — flytta till en liten muted "Underlag: 6h 58m okänt, 19m privat" om det finns dolt material.
- I `'evidence'`-läge: nuvarande beteende oförändrat.
- Console-debug bakom `if (import.meta.env.DEV)`:
  `console.debug('[StaffGpsDayRow]', date, { reportSourceUsed, visibleReportRowsCount, hiddenEvidenceRowsCount, hiddenEvidenceKinds, mergedSameTargetRowsCount })`.

### 4. `src/components/staff/StaffGpsWeekPanel.tsx` (EDIT, ~5 rader)

- Skicka `mode="report"` till `StaffGpsDayRow`.
- Byt footer-texten från "Tid per projekt = tid inom geofence. Boende räknas inte." till **"Tidrapport-underlag (filtrerat från GPS). Råa pings & glapp visas i kartan."** — slår fast vad listan är.

### 5. `src/components/staff/StaffGpsSatelliteMap.tsx` (EDIT, 1 rad)

Inget logikbyte; endast överskrift om en sådan finns ovanför panelen. Om det finns en panel-titel "GPS-vecka" → ändra till "Tidrapport (vecka)". Verifieras vid edit.

### 6. Inga ändringar

- Inget rörs i: `get-staff-gps-week-summary`, `dayPartition.ts`, `staff_location_history`, `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`, `staff_day_report_cache`.
- Kartan, råpings, evidence-drawer och `StaffGpsSatelliteMap` evidence-features lämnas orörda.

## Vad användaren får

Veckopanelen på bilden visar efter ändringen:

```
Tis 26/5                          08:58 – 20:08   11h 10m
Arbete 9h 20m   Resa 1h 50m
● FA Warehouse           08:58–09:49           51m
● Resa FA → game fair    09:49–11:00         1h 11m
● Swedish game fair      11:00–19:29         8h 29m
● Resa game fair → FA    19:29–20:08           39m
Underlag: 6h 58m okänt natt, 19m privat (dolt)
```

Inga GPS-glapp-rader, ingen "→ samma plats"-resa, ingen natt-okänd-rad, ingen privat-rad i huvudvyn.

## Validering

- `bunx vitest run src/lib/staff-gps/__tests__/reportRowFilter.test.ts` (måndag-sandwich + tisdag-natt-fixturer).
- Befintliga tester: `bunx vitest run src/test/staffGpsSatelliteMap.contract.test.ts` ska fortsätta passera (kontraktet rör imports, inte rad-rendering).
- Manuell preview-check på `/staff/.../map` för Raivis 25–26/5.

## Vad jag INTE gör

- Inget koppling till `display_blocks_json` (för stor refaktor för "minsta möjliga ändring"; kan göras som steg 2 om du vill).
- Ingen DELETE/UPDATE.
- Inga nya tabeller/edge-funktioner.
- Time Engine och mobil-appen orörda.
