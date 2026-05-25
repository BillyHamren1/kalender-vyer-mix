
## Mål

I dagslistan på `/staff-management/gps-satellite-map` (komponenten `StaffGpsDayRow`) visar varje resa idag bara texten "Resa". Den ska istället visa **startplats → slutplats**, t.ex.:

```
• Resa  FA Warehouse → Swedish game fair   11:20–11:58   38m
```

Dessutom: om personen **börjar dagen på lagret och sedan åker direkt** (inget besök innan), ska lagret alltid synas som ett eget segment ovanför resan – inte tappas eller smältas in i resan.

## Vad ändras

### 1. `src/lib/staff-gps/dayPartition.ts` + Deno-spegel `supabase/functions/_shared/staff-gps/dayPartition.ts`

- Utöka `DaySegment` med två valfria fält: `fromLabel?: string | null`, `toLabel?: string | null`.
- I `buildDayPartition`, när vi pushar ett `travel`-segment (via `classifyGap` returnerar `travel`), titta på `visits[i-1]` (besök precis innan gapet) och `visits[i]` (besök precis efter gapet) och sätt:
  - `fromLabel = previousVisit.knownSite?.name ?? null`
  - `toLabel   = nextVisit.knownSite?.name ?? null`
- För travel-segmentet i slutet av dagen (efter sista visit, `cursor < winEnd`): `fromLabel = lastVisit?.knownSite?.name ?? null`, `toLabel = null`.
- För travel-segmentet i början (om `cursor < firstVisit._s` och blir travel): `fromLabel = null`, `toLabel = firstVisit.knownSite?.name ?? null`.
- Filerna måste hållas byte-för-byte identiska (utöver typ-importer) enligt befintlig regel.

### 2. `src/components/staff/StaffGpsDayRow.tsx`

- För `s.type === 'travel'`: rendera label som `Resa  {fromLabel ?? '—'} → {toLabel ?? '—'}` istället för bara `s.label`.
- Behåll layout, dot-färg, tider och `fmtDur` oförändrat. Trunkera elegant på smala skärmar (`truncate` finns redan).

### 3. Lagervistelse-garanti (FÖRST på lager → åker direkt)

- I `supabase/functions/_shared/staff-gps/snapshotCache.ts` (`buildExactGeofenceVisits`): säkerställ att en visit som börjar redan på dagens första inside-ping (`firstIso == visit.start`) **alltid** behålls även om längden är kort (>0 min). Inget min-duration-filter i exit-logiken för "första besöket på dagen".
- I `StaffGpsDayRow.tsx`: ändra filtret `segments.filter((s) => s.minutes >= 1)` så att `work`/`private`-segment (kända platser) ALDRIG filtreras bort – bara `idle`/`gps_gap`/`unknown_place`/`travel` < 1 min får döljas. Då kan ett 30-sekunders lager-stopp innan resa fortfarande visas.

## Tester (vitest + Deno test)

- Nytt test i `src/lib/staff-gps/dayPartition.test.ts` (lägg till om saknas):
  - "travel-segment får fromLabel och toLabel från angränsande visits"
  - "första travel-segment utan föregående visit har fromLabel=null, toLabel=nästa plats"
  - "lager → direkt resa (warehouse-visit slutar exakt där travel-gap börjar) → båda segmenten finns kvar"
- Kör befintlig svit + snapshot-cache-tester (`supabase--test_edge_functions` på `_shared/staff-gps`).
- Kör `bash scripts/test-time-reporting.sh` om relevant.

## Vad ändras INTE

- Inga DB-migrationer.
- Inget annat UI (mobil `MyDayTimeline`, admin `DayBlockTimelineView`, `StaffTimeReportsList`) – endast `StaffGpsDayRow` enligt skärmdumpen.
- Ingen ny exit-tröskel utöver det vi redan diskuterat.
