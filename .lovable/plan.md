# Plan: Stannplatser & resor — korrekt tolkning

## Mål
Systemet ska tolka en personals dag exakt som GPS-listan ("Faktiska besök & förflyttningar") visar:
- Stationära perioder = **stopp på en plats** (även om platsen inte är planerad).
- Förflyttning mellan stopp = **resa** (bara den faktiska restidens längd, inte summan inkl. stillastående).
- Ett 3h stillastående hos icke-planerad adress + körning vidare = "Stannade på X i 3h. Ej planerat. Åkte sen vidare till Y." — INTE "resa 4h".

## Sanningskälla (single source)
`pingPlaceSegments.ts` (frontend) genererar den korrekta segment-listan. Den ska bli sanningen även för:
1. Server-engine (`day-timeline-engine` / `get_staff_day_reality`).
2. Förslag/anomalier (correction suggestions).
3. Sammanfattningar i Staff Management Reports.

## Steg
1. **Extrahera ping-segmenteringen till delad modul** (`supabase/functions/_shared/timeline/pingSegments.ts`) — port av `pingPlaceSegments.ts`. Frontend importerar samma logik från `src/lib/timeline/pingSegments.ts` (eller behåller och delar via shared util som båda bygger på).
2. **Ny event-typ i timeline-modellen**: `unplanned_stay` (stannade på oplanerad plats) — separat från `travel` och `presence`.
3. **Eventbuilder** (`supabase/functions/_shared/timeline/eventBuilder.ts`) bygger events från ping-segment IST.f. att blanda time_reports + GPS rått:
   - Stationärt segment ≥ X min på känd kund/projekt-adress → `presence` (matcha plats).
   - Stationärt segment ≥ X min på okänd adress → `unplanned_stay`.
   - Mellan två stationära segment → `travel` (bara den rörliga delen).
4. **Korrektionsförslag** baseras på diff mellan GPS-sanningen och `time_reports`, inte tvärtom.
5. **UI Staff Management Reports**: visar `unplanned_stay` med text "Stannade på {adress} i {duration}. Ej planerat." + förflyttning före/efter.
6. **Tidszon**: all tolkning sker i Europe/Stockholm. Centraliserad helper, ingen rå UTC-jämförelse i builders.

## Skydd
- Kontrakt-test (`pingSegments.contract.test.ts`) som låser: 23 segment för Ivar 2026-05-03 → exakt samma 23 events från engine.
- Aldrig blanda `travel` och `stay` — tydlig diskriminerad union i types.

## Filer som ändras
- `supabase/functions/_shared/timeline/pingSegments.ts` (ny)
- `supabase/functions/_shared/timeline/eventBuilder.ts` (skriv om)
- `supabase/functions/_shared/timeline/types.ts` (lägg till `unplanned_stay`)
- `supabase/functions/day-timeline-engine/index.ts` (använd ny builder)
- `src/lib/timeline/pingSegments.ts` (refaktorera, exportera ren funktion)
- `src/components/staff/DayTimelineEventRow.tsx` (rendera `unplanned_stay`)
- `src/hooks/admin/useDayTimeline.ts` (typer)
- `src/integrations/supabase/types.ts` (auto efter migration om enum)

## Migration
Lägg till `'unplanned_stay'` i `day_timeline_events.event_type` enum/check-constraint.
