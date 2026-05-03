# Fix GPS visit ↔ ping mismatch (exact membership)

## Problem
`PlaceVisit` exposerar bara `pingCount`. `GpsStopsRows.tsx` återskapar pings genom tidsfiltrering (`recorded_at >= visit.start && <= visit.end`). När segment-motorn slår ihop/splittar segment hamnar fel pings under fel föräldra­rad — t.ex. förälder visar Sollentuna men barnen visar Gamla stan (~20 km bort). Dessutom låter `refreshUnknownAnchor()` ankaret driva, så två fysiskt olika platser kan glida ihop till ett segment.

## Lösning (kort)
Bär med exakta pings hela vägen från segment-motor → UI. Förbjud tidsbaserad gissning. Stäng ankar-driften. Ena React-Query-källan.

---

## Steg

### 1. `src/lib/staff/pingPlaceSegments.ts`
- Lägg till `pings: Ping[]` (required) på `PlaceVisit`.
- I `closed.map(...)`: sätt `pings: seg.pings`, `pingCount: seg.pings.length`.
- I merge-loopen: konkatenera `pings: [...last.pings, ...v.pings]`, `pingCount = pings.length`.
- **Ta bort `refreshUnknownAnchor()` + alla anrop.** Okända visits behåller initialt ankare (centre av seedPings); drift bortom radien stänger segmentet via befintlig `pendingAway`-bekräftelse.

### 2. `supabase/functions/_shared/timeline/pingSegments.ts` (Deno-spegel)
- Samma ändringar: `pings`-fält, merge-konkatenering, ta bort `refreshUnknownAnchor`.
- Kommentar överst i båda filerna: **"MIRROR — ändra alltid båda i samma commit"** (samma policy som `packing-progress.ts`).

### 3. `src/components/staff/GpsStopsRows.tsx`
- Ta bort `pings.filter(t >= sMs && t <= eMs)` helt.
- Använd `visit.pings` direkt:
  - parent-rad: `pingCount = visit.pings.length`
  - expanderade barn-rader: `<VisitPingsRows pings={visit.pings} />`
- **Runtime guard:** för varje visit, kontrollera `haversineMeters(visit.centre, ping) <= 500` för alla pings. Om någon överskrider:
  - `console.error('GPS VISIT MISMATCH', { placeKey, centre, offending })`
  - rendera label: `"GPS mismatch – invalid segment"`

### 4. `src/components/staff/StaffPingDetailPanel.tsx`
- Ta bort lokala `useQuery({ queryKey: ['staff-pings-day', ...], queryFn: mobileApi.getMovementForDay })`.
- Använd `useStaffPingsForDay(staffId, date, true)` — samma key, samma cache.
- Behåll `fromIso`/`toIso`-fönsterfilter (legitimt UI-filter, inte segment-membership).
- Anpassa renderingen till `Ping`-shapen (`recorded_at` finns redan).

### 5. Tester
- `src/lib/staff/__tests__/pingPlaceSegments.test.ts`: nytt test som verifierar
  - `visits[i].pings.length === visits[i].pingCount`
  - alla pings i `visit.pings` ligger inom rimligt avstånd från `visit.centre` (t.ex. ≤ unknownRadius * 2)
  - efter merge: ingen ping-duplicering, kronologisk ordning
- Befintliga `pingCount`-asserts fortsätter gälla.

### 6. Memory
Skapa `mem://constraints/gps-visit-exact-ping-membership-v1`:
> `PlaceVisit.pings` är sanningen för vilka pings som hör till en visit. UI får aldrig återskapa medlemskap genom tidsfiltrering. `src/lib/staff/pingPlaceSegments.ts` och `supabase/functions/_shared/timeline/pingSegments.ts` är speglar — ändra alltid båda samtidigt.

Lägg referens i `mem://index.md` under Memories.

---

## Berörda filer
1. `src/lib/staff/pingPlaceSegments.ts`
2. `supabase/functions/_shared/timeline/pingSegments.ts`
3. `src/components/staff/GpsStopsRows.tsx`
4. `src/components/staff/StaffPingDetailPanel.tsx`
5. `src/lib/staff/__tests__/pingPlaceSegments.test.ts`
6. `mem://constraints/gps-visit-exact-ping-membership-v1` + `mem://index.md`

## Inte berört (per dina strikta regler)
- Mobilappen / hur pings sparas
- Reverse geocoding
- `mobileApi.getMovementForDay` API-shape
- `time_reports`-skrivvägar

## Förväntat resultat
- Parent-visit-rad matchar alltid sina expanderade pings geografiskt.
- Inga 20 km-mismatchar.
- Okända visits glider inte ihop till "ett enda långt stopp" via ankar-drift.
- En enda React-Query-källa för dagens pings.
