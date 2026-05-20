# GPS satellitkarta: 1 ping / 5 min med klockslag

## Mål
Kartan ska visa **en markör per 5-minutersfönster** över dagen, och **varje markör har sitt klockslag (HH:MM) som etikett**. Ingen klustring, inga "N pings"-bubblor.

## Ändringar

### 1. `src/components/staff/RawGpsSatelliteMap.tsx`
- **Ta bort all klustring:**
  - Källan `gps-raw-clusters-src`: ta bort `cluster`, `clusterRadius`, `clusterMaxZoom`, `clusterProperties`.
  - Ta bort lagren `gps-raw-clusters`, `gps-raw-cluster-count`, `gps-raw-cluster-span`.
  - Ta bort `enrichClusters()` och cluster-`click`/`mouseenter`/`mouseleave`-handlers.
  - Ta bort `gps-raw-time-labels` (var-5:e-etiketten ersätts av en etikett per punkt).
- **Downsampla input:** lägg till en pure helper `downsamplePingsByBucket(pings, bucketMs = 5*60_000)` som för varje 5-minutersbucket (golvat på `recorded_at`) väljer en representativ ping (förslag: den med bäst `accuracy`, annars första i bucket). Returnerar samma form som idag men med max 1/bucket.
- **Punktlager:** rendera ett vanligt `circle`-lager + ett `symbol`-lager som visar `HH:MM` (sv-SE) bredvid varje punkt på alla zoomnivåer (textOffset, halo för läsbarhet).
- **Linje:** behåll route-linjen men bygg den från den downsamplade serien så att linjen följer markörerna.
- **Popup på klick:** visa exakt `HH:MM:SS`, accuracy, källa (battery_source) — oförändrat innehåll, men nu per punkt.

### 2. `src/hooks/staff/useStaffGpsPingsForDay.ts`
Ingen ändring i query (vi behöver råa pings för att kunna välja bästa per bucket). Downsamplingen sker i kartan så råräkning kan visas i header ("X pings → Y punkter visas, en var 5:e min").

### 3. Test
Lägg till `src/components/staff/__tests__/downsamplePingsByBucket.test.ts` (vitest) som verifierar:
- 12 pings inom 30 min med varierande accuracy → exakt 6 buckets, varje bucket innehåller pingen med lägst accuracy.
- Tomt input → tomt output.
- Pings glesare än 5 min → oförändrad längd.
- Bucket-boundary: en ping på 09:05:00.000 hamnar i `09:05`-bucket, inte `09:00`.

Körs via `bunx vitest run downsamplePingsByBucket`.

## Vad som INTE ändras
- Dropdown-filter, datumväljare, filter-modes (assigned/pinged/both/all).
- Hooken `useStaffGpsPingsForDay` och dess query mot `staff_location_history`.
- Inget i Time Engine, dayJournal eller andra konsumenter — den här downsamplingen är ren visualisering i `RawGpsSatelliteMap`.

## Teknisk detalj
ASCII-skiss av downsampling:

```text
recorded_at:  09:01  09:02  09:03  09:06  09:08  09:12
accuracy:     35     12     50     20     8      40
bucket(5min): 09:00  09:00  09:00  09:05  09:05  09:10
picked:              ^bästa             ^bästa  ensam
result:       09:02 (acc 12), 09:08 (acc 8), 09:12 (acc 40)
```
