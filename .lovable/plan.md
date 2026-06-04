## Mål
Göra så att `/staff-management/time?tab=lon` visar samma platsklassning som GPS-satellitvyn för samma person/dag, så att `FA Warehouse` inte blir `Okänd plats` när canonical GPS redan har matchat platsen.

## Plan
1. **Kartlägg och lås den verkliga divergensen**
   - Verifiera vilka fält Tid & Lön faktiskt läser idag (`staff_day_report_cache.display_blocks_json` / `report_candidate_blocks_json`) och vilka fält GPS-satelliten läser (`staff_gps_day_snapshots.visits` via snapshot/canonical).
   - Säkerställ med riktade tester att samma `(staffId, date)` idag kan ge olika resultat i de två pipelines.

2. **Gör resolvern canonical-first för GPS-proposal-läget**
   - Uppdatera den gemensamma resolver-/week-matrix-pipelinen så att cache-rader i `gps_proposal` byggs från den canonical projektionen när den finns, istället för att lita på en äldre/avvikande `display_blocks_json`.
   - Behåll submission-prioritet oförändrad: `staff_day_submissions` ska fortsatt vinna över allt.
   - Scope: endast cache-/gps_proposal-visning, inte godkända eller inskickade dagar.

3. **Täta skrivvägen till `staff_day_report_cache`**
   - Identifiera och justera eventuell skrivväg som fortfarande kan lämna legacy-/unknown-block i `display_blocks_json` trots att canonical finns.
   - Säkerställ att cacheprojektionen till `display_blocks_json` och `report_candidate_blocks_json` alltid speglar samma canonical blocklista för GPS-förslagsdagar.

4. **Verifiera med testfall för just detta fel**
   - Lägg till/uppdatera tester som bevisar:
     - GPS-satellit och Tid & Lön ger samma platslabel för samma dag.
     - `FA Warehouse` inte degraderas till `Okänd plats` när canonical redan matchat lagret.
     - Submission-dagar påverkas inte.

5. **Manuell kontroll i preview**
   - Kontrollera i preview att raden i Tid & Lön använder samma plats som GPS-sat-bilden för det aktuella fallet.
   - Kontrollera att inga nya regressionsfel uppstår i veckomatriser eller dagsdetalj.

## Tekniska detaljer
- Berörda delar kommer sannolikt vara:
  - `supabase/functions/_shared/staff-day-report/resolveStaffDayReport.ts`
  - `supabase/functions/get-staff-time-week-matrix/index.ts`
  - `supabase/functions/backfill-staff-day-report-cache/index.ts`
  - eventuellt shared canonical-projektion under `supabase/functions/_shared/staff-gps/`
- Ingen schemaändring planeras.
- Ingen ändring av submission-prioritet eller annan affärslogik utanför denna pipeline-drift.

## Förväntat resultat
För dagar utan submission ska Tid & Lön och GPS-satellit visa samma platsklassning från samma canonical GPS-underlag, så att admin inte längre får `Okänd plats` där GPS-sat redan visar `FA Warehouse`.