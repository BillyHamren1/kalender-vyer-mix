# Fix: Travel-block markeras som review trots kända targets i båda ändar

## Vad jag hittade

I `supabase/functions/_shared/time-engine/buildWorkdayAllocationFromLocationTruth.ts` byggs `MovementContext` för varje movement-segment i ett pre-pass (rad 1248–1315). Det är detta pre-pass som avgör om en förflyttning blir:
- `commute_travel`,
- `work_travel`, eller
- `needs_work_allocation_review` med varningen `movement_missing_anchor` (som UI:n felöversätter till "saknar start- och slutadress").

Logiken i `deriveAllocation` (rad 714) säger:
```
if (!ctx || ctx.fromSide === 'unknown' || ctx.toSide === 'unknown')
   → needs_work_allocation_review + movement_missing_anchor
```

Pre-passet sätter `fromSide`/`toSide = 'unknown'` så fort EN av dessa är sann:

1. `movementMeta.fromTarget` / `toTarget` saknas (`detectTrueMovement` skickar bara med grannens `matchedTarget` ELLER inget).
2. Fallback-loopen läser endast `p.businessContext.matchedTarget ?? p.matchedTarget` på närmaste icke-movement-granne, OCH `break`:ar direkt om grannen inte har någon raw `matchedTarget` — även om grannen senare får en target via `resolveSegBusinessContext` (Lager 3.7), via assignments-overlap, eller via known_targets.
3. Targets som faktiskt syns i UI/karta (t.ex. resolverad via businessContext-fallback, manuell override, large_project-hint, BSA-overlap) räknas inte i pre-passet eftersom businessContext-resolveringen körs FÖR VARJE segment senare i huvudloopen (rad ~1415).

Resultat: trots att UI:n renderar start- och slutmarkörer (för att de hittas via senare resolverings­steg eller via efterföljande segments faktiska target), tror motorn att fromSide/toSide är `unknown` och flaggar `movement_missing_anchor`.

## Vad jag vill ändra

Endast frontend/timeengine-presentation. Inga regler för user-bekräftelse, lön eller submission rörs.

### 1. Stärk fallback-kedjan för from/to-target i movement-prepasset
Fil: `supabase/functions/_shared/time-engine/buildWorkdayAllocationFromLocationTruth.ts` (rad 1273–1293).

- Sluta `break`:a direkt efter första icke-movement-grannen utan target. Fortsätt loopa tills:
  - vi hittar en granne med target (matchedTarget eller `private_residence`), ELLER
  - tidsavståndet till föregående/efterföljande stay blir för stort (säg > 4h), eller listan tar slut.
- Innan vi ger upp, kör en sista resort: kalla `resolveSegBusinessContext(neighbor)` (helpern definieras längre ned i samma fil) och använd dess resulterande target. Det betyder att vi måste antingen flytta `resolveSegBusinessContext` upp eller bygga ett litet inline-uppslag via `allKnownTargets` + `getOverlappingAssignmentsForInterval` för grannsegmentets intervall.
- Om grannen är `known_address` utan target men har koordinater som matchar ett `KnownTargetEvidenceItem` (radius/zone), använd det target:et.

### 2. Spegla fixen i frontend-kopian
Fil: `src/lib/time-engine/buildWorkdayAllocationFromLocationTruth.ts` om den existerar speglad. Annars: ingen åtgärd där, men kontrollera först.

### 3. Bättre varningskod när vi verkligen inte hittar
När pre-passet trots allt landar i `unknown`, byt varningen från `movement_missing_anchor` till en mer korrekt: lägg till en ny variant t.ex. `movement_anchor_unresolved_to_target` så att UI:n kan visa "Start eller slut kan inte kopplas till känt projekt/lager/hem" i stället för den missvisande "saknar start- och slutadress".

UI-mappningen (där texten "saknar start- och slutadress" produceras — `timeReportReviewEntry.ts` eller `segmentVisuals.tsx`) uppdateras till att läsa nya koden och alltid visa reverse-geocode-adressen (eller råa lat/lng) som from/till-label så att användaren ser den faktiska GPS-platsen i blocket.

### 4. Tester
Lägg till test i `buildWorkdayAllocationFromLocationTruth_layer34_test.ts`:
- **Test A:** Movement där omedelbart föregående grannsegment är `unresolved_location` utan matchedTarget, men segmentet före det är `known_site` med matchedTarget=project. Förväntat: `fromSide = work_project`, allokering = `work_travel`.
- **Test B:** Movement där neighbor stay är `known_address` utan matchedTarget men koordinater overlap:ar ett `KnownTargetEvidenceItem` (warehouse). Förväntat: `toSide = work_warehouse`.
- **Test C:** Movement där båda sidor är project/large_project via businessContext-fallback. Förväntat: `work_travel`, ingen `movement_missing_anchor`-varning.

## Det jag INTE rör
- Submission / user confirmed / payroll-regler
- Geofence-, GPS- eller ping-logik
- Calendar/rig/rigdown-färgning (separat fix levererad tidigare)
- Mobil-tidslinjens egen tolkning av movement

## Resultat efter fix
Travel-blocket i Gantt:n för den dag du tittade på ska gå från "Behöver kontrolleras: saknar start- och slutadress" → vanligt grönt/blått `work_travel`-block (eller `commute_travel` om en sida är `private_zone`), med korrekta start- och slutadresser i tooltipen.
