## Vad jag faktiskt ser i loggarna och databasen

Billys cache-rad för 2026-05-20 (`staff_day_report_cache`, byggd 13:31, engine_version `large-project-target-fix-v1`):

- `display_blocks_json` = **[]** (tom — men fältet finns → V2 "explicit tomt")
- `report_candidate_blocks_json` = **5 block** (alla `signal_gap` / `transport` / `unknown_place` — inget `work` / `timer_marker`)
- `diagnostics_json.locationTruthV2.counts.segmentsByType`:
  - `unresolved_location: 110`
  - `private_residence: 2`
  - `movement: 4`
  - `known_address: 3`
  - **`known_target: 0`** ← inget GPS-kluster har matchat ett känt projekt/lager
- `dayEndDecision`: `dayEnded=true endReason=no_fresh_evidence_after_last_work endedAt=13:30:44 confidence=medium` (gren 5 i `computeDayEndDecision`)
- `gpsEvidence` i `get-mobile-staff-day-report`-loggen: 370 råpings 01:34 → 13:38, men `hasGpsEvidenceButNoRenderedWork=true`, `reasonNoWorkRendered=v2_present_but_empty`

Edge-funktionen tar då rätt beslut enligt sin nuvarande kontrakt: `cacheHasV2Field=true` ⇒ ingen live-fallback ⇒ snapshot blir tom ⇒ "rapporten försvinner". Samtidigt fortsätter mobilen pinga (det är `useBackgroundLocationReporter` som matar `staff_location_history` — helt frikopplat från rapporten). Därför: **pings kommer, men rapporten är tom**.

## Grundorsak

Dagsmotorn klassar Billys hela arbetsdag som `unresolved_location` (110 av 119 segment). Eftersom inget segment blir `known_target`/`work`/`timer_marker` filtrerar `enrichReportBlocksForCache` bort allt från `display_blocks_json`. Det tomma V2-fältet är en *legitim* signal att Time Engine kört, men för Billy ger den noll information — fast vi har en hel dag med vistelser som **borde** synas som "oklar plats — bekräfta" i tidslinjen.

Två separata fel ligger bakom:

1. **Renderings-bug (det användaren ser):** `enrichReportBlocksForCache` släpper bara igenom "work"-liknande block till `display_blocks_json`. Block av typen `unknown_place` / `signal_gap` / `transport` försvinner helt — trots att de finns i `report_candidate_blocks_json`. Det är därför rapporten visuellt blir tom.
2. **Klassningsbug (orsaken till varför det är så många unknown):** Av 25 kända targets med koordinater matchade noll mot Billys 119 kluster. Antingen är targets fel geokodade, för snäv radie, eller så filtreras stora projekt bort i target-resolvern. Det här är en separat utredning.

## Plan — två steg, ultra-säkert / additivt

### Steg 1 (denna runda — fixar "rapporten försvinner")

**Mål:** När Time Engine producerat candidate-block men inget hamnar i `display_blocks_json`, ska mobilen ändå rendera dem som "oklara segment att bekräfta" istället för en tom skärm.

Två additiva ändringar — ingen befintlig logik byts ut:

1. `supabase/functions/_shared/time-engine/enrichReportBlocksForCache.ts`
   - Lägg till en *fallback*-pass: om resultat-arrayen för `display_blocks_json` är tom **och** `report_candidate_blocks_json.length > 0`, mappa candidate-blocken till display-format med `kind='needs_review'` (eller motsvarande befintligt fält som redan visas i mobilens "oklara"-rad). Markera dem `provisional=true` så de inte räknas som lönegrundande.
   - Lägg en flagga i `diagnostics_json.displayFallback = { reason: 'no_work_blocks_only_unknown', sourceCandidateCount: N }`.

2. `supabase/functions/get-mobile-staff-day-report/index.ts`
   - Logga ut den nya `displayFallback`-anledningen i mirror-loggen så vi kan följa upp.
   - Inget annat ändras i mirror-kontraktet — `cacheHasV2Field` förblir true och vi anropar fortfarande inte live-motorn.

3. Mobilrendering — **ingen kodändring**. `mapReportBlocksToSegments` hanterar redan `needs_review`/`unknown` som "Oklart — bekräfta", så samma block visas automatiskt.

4. Tester (Deno + vitest, additivt):
   - `supabase/functions/_shared/time-engine/__tests__/enrichReportBlocksForCache.fallback.test.ts` — verifierar att en candidate-bunt utan work fortfarande producerar minst 1 display-block med `provisional=true`.
   - `src/test/mobileDayReportFallback.contract.test.ts` — kontraktstest att `mapReportBlocksToSegments` renderar `needs_review` som synlig "oklar" rad.

5. Verifiering:
   - Deploya `enrichReportBlocksForCache`-användarna (`backfill-staff-day-report-cache`, `sync-staff-day-report-cache`, `get-staff-presence-day`, `submit-staff-day-v3`).
   - Tvinga refresh av Billys cache via `backfill-staff-day-report-cache` med `staffIds=[365f4d55…]`, `dateFrom/dateTo=2026-05-20`, `skipExisting:false`.
   - Läs tillbaka raden och bekräfta `display_blocks_json.length > 0` + `diagnostics_json.displayFallback`.
   - Curl `get-mobile-staff-day-report` som Billy och verifiera att `blockCount > 0`.

### Steg 2 (nästa runda — separat ärende)

Utred varför 110/119 segment blev `unresolved_location` trots 25 kända targets med koordinater. Troliga kandidater (utreds, inga ändringar nu):

- `resolveWorkTargets` filtrerar bort stora projekt eller targets utan giltig polygon.
- Klusterradien (`MIN_VISIT_MIN` / cluster-centroid) faller utanför target-radien för Billys faktiska arbetsplats den dagen.
- Booking-koordinater saknas/är fel — kontrollera mot `organization_locations` och `large_projects.coordinates`.

Det här är ett *klassnings*-fel som påverkar lönedata och kräver mer försiktighet — körs separat.

## Vad jag INTE gör i steg 1

- Rör inte `computeDayEndDecision` (dagsslutsbeslutet är korrekt).
- Rör inte `buildReportCandidateBlocks` eller någon klassning.
- Rör inte mobil-frontends ping-takt eller `useBackgroundLocationReporter` — pingsen är inte buggen.
- Rör inte mirror-kontraktets V2-policy (cache-hasV2 → ingen live-fallback).
- Inga DB-migrationer.

## Filer som ändras (steg 1)

- `supabase/functions/_shared/time-engine/enrichReportBlocksForCache.ts` (additivt fallback-block)
- `supabase/functions/get-mobile-staff-day-report/index.ts` (utökad logg)
- `supabase/functions/_shared/time-engine/__tests__/enrichReportBlocksForCache.fallback.test.ts` (ny)
- `src/test/mobileDayReportFallback.contract.test.ts` (ny)
