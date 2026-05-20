## Problem

Default-vyn ("Visa rörelser mellan") döljer för mycket:

1. **Linjer som går in/ut ur geofence försvinner.** `insideFence` sätts till `true` så fort ≥50 % av segmentets pings ligger inne i en fence. En linje som börjar utanför och åker in (eller tvärtom) får ofta majoritet inne och filtreras bort i sin helhet.
2. **Röda stay-markers (lång vistelse) inne i fence är borta.** `gps-stay-points` / `gps-stay-labels` ingår i `FENCE_HIDEABLE_LAYERS` och taggas `insideFence` när stay-centrum ligger i fence, så de döljs helt.
3. **Move-label-punkterna (klockslag var ~5 min) som ligger inne är borta** av samma skäl.

Användaren vill: alla pings/linjer/stay-markers ska synas, men räkningen av "block 1 in→ut, block 2 …" ska börja UTANFÖR fence (dvs vid övergångarna). Endast linjer som är HELT inuti fence (jitter) får döljas.

## Plan

Allt i `src/components/staff/RawGpsSatelliteMap.tsx` — ingen dataändring.

### 1. Linje-segment: strict "helt inne"
Räkningen av `insideFence` per linje ändras från "≥50 % av pings inne" till "ALLA pings inne i samma fence". Då döljs endast jitter som aldrig lämnar området; varje linje som korsar fence-gränsen ritas ut i sin helhet (default-vy = mellan-rörelser inkl. in/ut).

### 2. Stay-markers och move-labels döljs aldrig av fence-filtret
Tas bort ur `FENCE_HIDEABLE_LAYERS`:
- `gps-stay-points`
- `gps-stay-labels`
- `gps-move-points`
- `gps-move-labels`

Kvar i listan blir bara `gps-line-segments` och `gps-line-arrows`. Röda långvistelse-markörer kommer alltid att synas, oavsett toggle. Tidsklockslag på rörelse-pingsen likaså.

### 3. "Visa rörelser innanför geo"-läget
Toggle:on visar inversen — bara linjesegment som ligger helt inom fence (jitter inne). Övriga lager (stay + move labels) påverkas inte, så hela kontexten finns kvar.

### 4. Block-panel (in→ut-räkning)
Bekräfta att block-panelen bygger på fence-vistelser, inte på `insideFence`-taggen. Räkningen ska börja vid första pingen som korsar IN i fence och avslutas vid första pingen som korsar UT, så block 1 in→ut osv. blir tydliga övergångar. (Logiken är redan visit-baserad — verifieras, justeras vid behov utan databorttagning.)

### 5. Test
- Uppdatera `src/test/staffGpsSatelliteMap.contract.test.ts`:
  - Linje med blandade pings (några ute, några inne) → `insideFence=false` (visas i default).
  - Linje med alla pings inne → `insideFence=true` (döljs i default, visas i innanför-läge).
  - `FENCE_HIDEABLE_LAYERS` innehåller inte stay/move-label-lager.
- Kör `bun vitest run src/test/staffGpsSatelliteMap.contract.test.ts` + `segmentPingsForDisplay.test.ts`.

## Inget tas bort från datan
Bara Mapbox `setFilter` styr synlighet. Pings, linjer och visits hämtas och renderas precis som idag.
