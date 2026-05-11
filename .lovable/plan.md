## Bakgrund

Blocken i admin-tidrapportvyn (`/staff-management/time-reports`) skapar inga `time_reports`. De är endast visningskandidater (`reportCandidateBlocks`) som motorn `get-staff-presence-day` bygger från GPS + targets. `time_reports` skapas bara via mobile-app-api (eller admin-knappen i StaffTimeReportDetail). Lön och projektkostnad påverkas alltså inte av dessa rader — de är bara granskningsflaggor.

Idag märks korta glapp (t.ex. 41 min mellan två arbetsplatsblock) som `Osäker period` / `needs_review`. Det blir visuellt brus i listan och kräver onödig manuell granskning, trots att perioden ligger inbäddad mellan två bekräftade arbetsblock.

## Mål

Korta osäkra perioder som ligger sandwichade mellan två arbetsblock ska automatiskt klassas som arbete med ärvd projekt-label, istället för att flaggas som granskning.

## Regel

Ett `unknown` / `needs_review`-block konverteras till `work` när **alla** villkor är uppfyllda:

1. Längd ≤ **90 min**
2. Närmast föregående icke-osäkra block är `work`
3. Närmast efterföljande icke-osäkra block är `work`
4. Blocket ligger inom samma kalenderdag

Etikett:
- Om föregående och efterföljande arbetsblock pekar på **samma target** (samma projekt/large_project/location) → ärv det target + label
- Annars → label `Arbete (okänd plats)`, target = `null`, men `kind = work`

Blocket markeras med ny diagnostik-flagga `inferred_from_neighbors: true` så att admin kan se att det är auto-bedömt och vid behov filtrera fram dessa.

## Var ändringen sker

Ren motor-/display-justering, ingen ny affärslogik, inga skrivningar:

- `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts` — efter normal blockbyggning, kör en sandwich-pass som konverterar kvalificerande osäkra block till `work` med ärvd target. Detta gör att även `staff_day_report_cache` får rätt summor framöver.
- `src/lib/staff/buildReportDisplayBlocks.ts` — gruppera bort konverterade block från "Osäker period"-grupperingen; visa dem som vanliga arbetsrader med en liten "auto"-badge (`inferred_from_neighbors`).
- `src/components/staff/ReportCandidateTimeline.tsx` / `StaffDayTimelineCard.tsx` — rendera badge "Auto-bedömt" diskret på dessa rader.

## Vad ändras INTE

- Inga skrivningar till `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`.
- Mobilappen påverkas inte — detta är admin-vy och cachelogik.
- Tröskel/krav är konservativa: regeln slår aldrig in vid dagsstart, dagsslut eller intill transport/needs_review.
- Long stretches (>90 min) eller asymmetriska sandwiches (work↔transport, work↔none) flaggas som idag.

## Backfill

Efter deploy körs `backfill-staff-day-report-cache` för perioden 2026-04-20 → 2026-05-11 (samma scope som senaste backfillen) så att historiska dagar får den nya klassningen i cache. `skipExisting: false` denna gång eftersom diagnostiken ändras. Säkerhetskontroll: 0 skrivningar till skyddade tabeller (samma guard som tidigare).

## Validering

1. Enhetstest i `_shared/time-engine` för 6 fall: kort sandwich samma projekt, kort sandwich olika projekt, kort sandwich med transport-granne, för långt block (>90 min), block vid dagsstart, block vid dagsslut.
2. Manuell kontroll i `/staff-management/time-reports` för exempeldagen i screenshoten — det 41-min-blocket ska bli en arbetsrad med ärvt projekt och "auto"-badge, inte längre under "att granska".
3. Bekräfta att `staff_day_report_cache.diagnostics_json` innehåller `inferred_from_neighbors`-räknare.
