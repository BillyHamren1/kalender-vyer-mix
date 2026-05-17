## Diagnos

Du har rätt — det är inte en rimlig tolkning. Rotorsaken finns i `supabase/functions/_shared/timeline/buildGpsDayTimelineOnly.ts`:

1. **Klustring ignorerar target-radien.** `clusterPings` använder en hård `STATIONARY_RADIUS_M = 80 m` för att avgöra om något är "stationärt". En target (projekt/lager) har ofta 200–500 m radie. Står du och rör dig 100–200 m inom samma target (mässhall, lager, festival, byggområde) sprängs 80 m-gränsen → ingen stationär kluster bildas.
2. **Travel-chain byggs blint från "rörelse-pings".** `buildTravelChains` (rad 200–277) plockar alla pings som inte ligger i en stay-window och bakar in dem i en `transport`-chain — den frågar aldrig om hela chainen råkar ligga inuti samma kända target.
3. **Resultat:** 8 av 9 pings ligger inom samma target, en ligger marginellt utanför → algoritmen bygger en `transport`-segment ("Resa") + en `gps_gap` ("Osäker period / GRANSKA"). Admin-vyn visar precis det du ser på bild 2.

`matchSegmentsToPlaces` (matcher.ts) matchar alltid bara mot stationära kluster, så en travel-chain som faktiskt ligger inuti ett target tappas helt.

## Fix

Lägg till ett efter-steg i `buildGpsDayTimelineOnly.ts` som "drar in" rörelse-pings i target:

### Steg 1 — Target-aware reclassification av travel-chains
I `buildTravelChains` (eller direkt efter den), för varje chain:
- Räkna hur stor andel av chainens pings som ligger inom någon `knownTarget` (samma id för alla, eller ≥80 % inom samma target).
- Om ja → emitera ett `stay` med `type: "known_site"` och target-namnet istället för `transport`. Sätt `reason: "within_target_geofence_movement"` och `confidence: 0.75`.
- Om chainen ligger blandat (några inom target A, några utanför) men hela bounding-boxen täcks av target A:s radie → samma sak.

### Steg 2 — Merge in i angränsande matched stay
Om en target-internal travel-chain ligger direkt före eller efter en `stay` på samma target → slå ihop till en sammanhängande stay (utöka `startTs`/`endTs`). Detta tar bort onödiga delningar.

### Steg 3 — Inga gps_gap inom target
I gap-injectionen (rad 304–315): om både `prev` och `next` segment är `known_site` med samma `matchedSiteId`, ELLER om gap-pingsen ligger inom target → hoppa över `gps_gap`-injektionen (eller markera den `reason: "within_target_signal_dip"` och rendera dämpat istället för GRANSKA).

### Steg 4 — Test
Lägg till `supabase/functions/_shared/timeline/buildGpsDayTimelineOnly.targetWiggle.test.ts` med exakt scenariot från bild 1 (9 pings, 8 inom target-radie, en ~100 m utanför). Förväntat output: **ett** `stay`-segment på target, ingen `transport`, ingen `gps_gap`.

## Filer som ändras

- `supabase/functions/_shared/timeline/buildGpsDayTimelineOnly.ts` — ny helper `reclassifyTravelInsideTargets(segments, knownTargets)` som körs efter `buildTravelChains` och före `gap-injection`.
- `supabase/functions/_shared/timeline/buildGpsDayTimelineOnly.targetWiggle.test.ts` — ny kontrakts-test.
- Inga frontend-ändringar krävs — admin-Gantten och mobilspegelns pipeline plockar upp den nya segmentstrukturen automatiskt.

## Vad detta INTE rör

- Klustringströsklarna (80 m / 5 min) lämnas orörda — vi tolkar bara om resultatet i ljuset av kända targets.
- Inga ändringar i regelmotorn för "oklara segment" eller AI — färre `gps_gap` betyder bara färre GRANSKA-chips, vilket är hela poängen.
- Ingen ändring i `time_reports`/lön/fakturering — bara visningen + det som regelmotorn matas med.
