## Diagnos — var det går fel

Felet ligger i ETT enda lager:

`supabase/functions/_shared/time-engine/buildTransportFromLocationTruth.ts`

Med pings i din skärmdump:

```
#1  00:09:01  hemma   (59.6512, 17.7206)
#2  00:09:03  hemma   (59.6512, 17.7204)
#3  06:26:20  jobbet  (59.6512, 17.7195)
```

Pipelinen gör så här:

1. `buildGpsDayTimeline` ser det stora glappet 00:09:03 → 06:26:20 (>10 min)
   och skapar KORREKT ett `gps_gap`-segment + en ny stay på jobbet.
   Här blir det aldrig "travel". Bra.

2. `buildLocationTruthFromDayEvidence` klassar:
   - Stay #1+#2 → `private_residence` (hem)
   - Stay #3 → `known_target` (jobbet)
   - Däremellan: `signal_gap`

3. `bridgeSignalGaps` ser olika targets → markerar `transition_candidate`,
   skapar INTE transport. Bra.

4. **`buildTransportFromLocationTruth` (rad 95–218) — buggen.**
   Den loopar alla "place"-segment och så fort den ser
   `A (plats) … signal_gap … B (annan plats)` med `haversine(A,B) ≥ 500 m`
   så pushar den ovillkorligen:

   ```ts
   transports.push({
     startAt: a.endAt,   // 00:09:03
     endAt:   b.startAt, // 06:26:20
     kind: 'transport',
     label: 'Resa',
     distanceMeters: 8,             // hem→jobb är ~8 m i ditt fall
     durationMinutes: 377,          // 6h17m
     supportEvidence: { sourceSignalGapSegmentIds: [...] },
   });
   ```

   Det finns INGEN kontroll av:
   - Glappets längd (377 min accepteras lika gärna som 5 min).
   - Att staffen faktiskt har EGEN GPS-displacement över glappet
     (`staffOwnDisplacementMeters` finns men anropas aldrig härifrån).
   - Att `classifyTransportSignalGap` (som har `MAX_GAP_MIN = 30`,
     hastighetskontroll, anchor-krav) godkänner glappet.
   - `night-auto-start-guard` (00:00–05:00 ska blockera).
   - `transport-requires-own-movement` (kräver staffens egen
     ≥ 500 m förflyttning).

   Att hemmet (`private_residence`) räknas som "place" i `isPlace()`
   (rad 82–85) gör att hem→jobb-paret över huvud taget hamnar i loopen.

Det här är samma byggare som matar `get-staff-presence-day` (raden
1207–1208 i den funktionen) — vilket är vad admin-vyn på skärmdumpen
renderar.

## Fix-plan

### 1. Hård gate i `buildTransportFromLocationTruth`

Innan vi pushar en transport mellan A och B, kräv ALLA dessa:

```text
- gapMinutes ≤ MAX_TRANSPORT_GAP_MIN (30 min, samma som classifyTransportSignalGap)
- staffOwnDisplacementMeters(lastPingBeforeGap, firstPingAfterGap) ≥ 500 m
- Inget av segmenten startar i nattfönstret 00:00–05:00 lokal tid
  (samma night-guard som backend redan har).
- A.kind !== 'private_residence'  (hem→annan-plats blir aldrig "Resa"
  utan riktig rörelse — det ska markeras `transition_candidate`/
  `unknown_gap_needs_review` så admin får välja).
```

Allt utom det första (`gapMinutes`-taket) krävs av Core memory:
`transport-requires-own-movement-v1` och `night-auto-start-guard-v1`.
Det är därför `classifyTransportSignalGap.ts` redan finns — men den
används inte av detta lager. Vi återanvänder den.

### 2. Mata in pings i byggaren

`LocationTruthSegment` har redan `diagnostics.sourcePingIds`. Vi
behöver pingens koordinater för att räkna `staffOwnDisplacement`.
Två alternativ:

- (A) Skicka in en kompakt `pingCoordsById: Map<id, {lat,lng,ts}>`
  som input till `buildTransportFromLocationTruth`.
- (B) Lägg `lastPing` / `firstPing` på `LocationTruthSegment` redan i
  `buildLocationTruthFromDayEvidence`.

Förslag: **(A)** — minst ytan på segmentkontraktet, isolerat till
detta lager. Kallsiten `get-staff-presence-day` har redan accepted-pings
i scope (linjerna före 1207).

### 3. Avvisat glapp → `internalMovementAbsorptions` med ny reason

När gaten faller, returnera istället:

```ts
absorptions.push({
  betweenSegmentIds: [a.id, b.id],
  distanceMeters,
  reason: 'rejected_no_own_movement'
        | 'rejected_gap_too_long'
        | 'rejected_night_window'
        | 'rejected_from_private_residence',
});
```

Downstream (`buildReportBlocksFromLocationTruth` /
`buildReportCandidateBlocks`) får då ingen transport-rad. Glappet
exponeras som `gps_gap`/`needs_review`, vilket admin-vyn redan vet
hur den ska rita.

### 4. Tester (Deno-test bredvid filen)

`supabase/functions/_shared/time-engine/buildTransportFromLocationTruth_guard_test.ts`:

- **fall A** — exakt ditt scenario:
  två hem-pings 00:09 + en jobb-ping 06:26, samma ~8 m radie.
  Förväntat: 0 transport, 1 absorption `rejected_no_own_movement`.
- **fall B** — hem 07:00 → jobb 07:40, två sammanhängande
  transit-pings med 12 km mellan dem.
  Förväntat: 1 transport, gap ≤ 30 min, displacement OK.
- **fall C** — projekt A 14:00 → projekt B 14:20 utan transit-pings
  men endast 4 minuters glapp, displacement 1 km mellan A och B
  cluster-centra.
  Förväntat: 1 transport (kort glapp + verklig egen rörelse).
- **fall D** — natt: jobb-cluster 02:10 → annan-plats 03:30,
  displacement 800 m, glapp 80 min.
  Förväntat: 0 transport, `rejected_night_window` + `rejected_gap_too_long`.

### 5. Cache-invalidering

Inga DB-ändringar. Men eftersom `staff_day_report_cache` har bakade
transport-rader för redan körda dagar behöver vi:

- Bumpa `engineVersion` i `_shared/time-engine/contracts.ts`
  så att existerande cache-rader anses inaktuella och byggs om vid
  nästa resolve.
- Inget `DELETE` (mem://constraints/never-delete-db-rows-without-explicit-request-v1)
  — cache byggs om passivt när dagen läses.

### 6. Skydd mot regression

Lägg till en arkitektur-kontrakts-test i
`src/test/transportRequiresOwnMovement.contract.test.ts` som läser
`buildTransportFromLocationTruth.ts` som text och misslyckas om
filen pushar en transport utan att referera `staffOwnDisplacement`
och `classifyTransportSignalGap`/MAX-gap-konstanten. Det är samma
mönster som övriga arkitektur-tester i `src/test/`.

## Filer som kommer ändras

- `supabase/functions/_shared/time-engine/buildTransportFromLocationTruth.ts`
  (gate + ny input `pingCoordsById`)
- `supabase/functions/get-staff-presence-day/index.ts`
  (skicka in pings till byggaren — endast call-site-ändring)
- `supabase/functions/_shared/time-engine/contracts.ts`
  (bumpa engineVersion)
- `supabase/functions/_shared/time-engine/__tests__/buildTransportFromLocationTruth_guard_test.ts` (NY)
- `src/test/transportRequiresOwnMovement.contract.test.ts` (NY)

Ingen UI-fil ändras, ingen DB-migration, inget skrivs till
time_reports / workdays / LTE / travel_time_logs.