## Problem

Kartan visar nu alla pings (fixat förra rundan), men tabellen i `StaffGpsSatelliteMap.tsx` kör fortfarande `downsamplePingsByBucket(5 min) + groupPingsByStay(≥20 min/60 m)`. Det är därför "pingsen mellan blocken är borta" — de slukas av stay-grupperingen och 5‑min‑bucketen. Två stay-rader (08:55–14:31 och 19:52–22:52) döljer allt som hände däremellan.

## Lösning

Ta bort all gruppering/downsampling i `PingTimelineTable`. Rendera en rad per rå ping, sorterade på tid.

### Ändringar i `src/components/staff/StaffGpsSatelliteMap.tsx`

- Ta bort imports av `downsamplePingsByBucket` och `groupPingsByStay`.
- I `PingTimelineTable`:
  - Använd `pings` direkt (sorterad på `recorded_at` asc).
  - Ta bort kolumnerna **Typ**, **Längd**, **Pings** (inga block längre).
  - Behåll: Tid, Lat, Lng, Accuracy, Source, Battery.
  - Rubrik: `Tidslinje (N pings)`.
  - Ingen "Vistelse"-badge, ingen stay-rad.

### Inte rört

- Kartan (`RawGpsSatelliteMap.tsx`) — redan utan filter.
- `downsamplePingsByBucket.ts` / `groupPingsByStay.ts` — låter ligga kvar, ingen använder dem nu men de skadar inte. (Kan ryckas senare om du vill.)

Inga andra filer/komponenter berörs.
