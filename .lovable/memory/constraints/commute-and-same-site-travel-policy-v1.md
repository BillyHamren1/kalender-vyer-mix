---
name: Commute & Same-Site Travel Policy
description: Boende → arbetsplats och arbetsplats → boende klassas som private (icke-payable). Same-site travel (samma knownSiteId eller samma label) absorberas. "Resa Westmans → Westmans" får aldrig visas. Enforcad i buildDayPartition + frontend-spegel.
type: constraint
---

## Regler

1. **Boende före första arbete** är `private` (`is_private_residence=true`). Räknas aldrig som workMin/payable. (Redan ren via visit-klassning.)
2. **Resa boende → första arbetsplats**: travel-segment vars FÖRRA stay är `private` reklassas till `type='private'`, label bevaras (`"Resa Boende - Venngarn → Westmans"`). Hamnar i `privateMin`, INTE `travelMin`.
3. **Resa sista arbetsplats → boende**: travel-segment vars NÄSTA stay är `private` reklassas på samma sätt.
4. **Same-site travel sandwich**: `stay(A) → [travel|unknown|gap|idle]+ → stay(A)` kollapsas till ETT block där A och B har:
   - samma `knownSiteId`, ELLER
   - båda är `work` med samma normaliserade label (case-insensitiv trim) — täcker fallet med två geofences för samma projekt (projekt + booking-syskon, eller large + booking).
5. **Resa kräver verklig destination**: same-target absorbtion ovan eliminerar "Resa Westmans → Westmans" oavsett distans/duration. Existerande Pass 2 absorberar dessutom korta travels (<10 min) som inte leder till ny adress.
6. **GPS-satelliten + Tid & Lön visar samma dag**: båda läser samma `buildDayPartition`-resultat. Tid & Lön via `canonicalToCacheBlocks` (cache `engine_version='canonical_mirror_v1'`), GPS-satelliten via frontend-spegel av `dayPartition.ts`.

## Implementation

- Pure helpers: `supabase/functions/_shared/staff-gps/dayPartition.ts` + spegel `src/lib/staff-gps/dayPartition.ts`.
- Funktioner: `absorbShortNoise` Pass 5 (same-site travel sandwich med `sameTarget`-jämförelse) + `reclassifyCommuteTravelAsPrivate` (kör efter absorbtion).
- `sameTarget(a,b)`: `knownSiteId` lika ELLER (båda work + samma normalized label).
- Tester:
  - `src/test/gpsDayPartition.contract.test.ts` (invarianter)
  - `src/test/gpsDayPartition.commuteAndSameSiteTravel.test.ts` (Regel 1–5)
- Cache-skrivare: `backfill-cache-canonical` (canonical → `staff_day_report_cache`).

## Förbjudet

- Ingen ny Time Engine, ingen ny pipeline, ingen ny cachemodell.
- Ingen specialfall för enskilda personer.
- Lägg ALDRIG till commute-detektion eller same-site-absorbtion utanför `dayPartition.ts`.
