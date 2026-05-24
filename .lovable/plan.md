## Vad användaren ser idag

På `/staff-management/gps-satellite-map`, Tors 21/5 för Raivis:
- **Geofence-besök-tabellen** (under kartan): 3 rader — `FA Warehouse 1h17m`, `FA Warehouse 1h0m`, `Westmans Uthyrning – 23 maj 2026 14h23m`. Korrekt.
- **Veckopanelen** (vänster): "Tors 21/5 · FA Warehouse 16h 40m". Fel — Westmans-projektet saknas och hela dagen klumpas på FA Warehouse.

## Varför skiljer det sig

De två vyerna körs på två olika motorer mot olika geofence-uppsättningar:

| Vy | Datakälla | Geofence-set |
|---|---|---|
| Geofence-besök-tabell | `useMobileStaffDayPings` → edge `get-mobile-staff-day-pings` (snapshot på servern) | Inkluderar Westmans-projektets pin för dagen (via `useDayKnownSites` + booking-fallback) |
| Veckopanel | `useStaffGpsWeekSummary` → råpings + lokal `buildExactGeofenceVisits` / `buildPlaceVisits` med `filterProjectGeofences` | Westmans-projektet filtreras bort den 21/5 (matchar inte rigday/event/rigdown direkt), så enda kvarvarande stängsel i området är FA Warehouse → klusterheuristiken lägger HELA dagen där |

Två oberoende motorer = två sanningar. Vecka måste gå genom samma snapshot som tabellen.

## Vad som ska byggas

### 1. Vecka använder snapshot per dag (en sanning)

Byt ut `useStaffGpsWeekSummary`-motorn så att den för varje dag i veckan hämtar samma snapshot (`get-mobile-staff-day-pings`) som dag-vyn använder. För varje dag exponera:
- `visits: PlaceVisit[]` — exakt samma lista som tabellen visar (privata boenden bortfiltrerade).
- `totalMin` — summan av `durationMin` över alla synliga visits.
- `firstIso` / `lastIso` — första/sista visit-start/-slut.

Ingen lokal `buildExactGeofenceVisits` / `filterProjectGeofences` kvar i veckosummeringen. Råpings-fetchen tas bort (snapshot innehåller redan visits).

### 2. Slå ihop vecka och Geofence-besök till EN container

Den befintliga `GeofenceVisitsTable` under kartan tas bort. Veckopanelen blir bredare och blir det enda stället där dagar och deras geofence-besök listas:

```text
┌─ Vecka 21 ────────────────────────────────────┐
│ Mån 18/5         09:43–23:01     13h 18m  ▸  │
│ Tis 19/5         06:59–20:35     13h 35m  ▸  │
│ Ons 20/5                       Endast hemma   │
│ Tors 21/5 ▾      06:28–23:13     16h 45m     │  ← vald, expanderad
│   ┌─────────────────────────────────────────┐ │
│   │ PLATS              IN      UT     TID   │ │
│   │ FA Warehouse    06:29  07:46   1h 17m   │ │
│   │ FA Warehouse    07:50  08:50   1h 0m    │ │
│   │ Westmans …      08:50  23:13  14h 23m   │ │
│   └─────────────────────────────────────────┘ │
│ Fre 22/5  …                                   │
└───────────────────────────────────────────────┘
```

- Vald dag är auto-expanderad och visar samma tabell som dagens "Geofence-besök".
- Övriga dagar visar bara rubrikraden (veckodag, datum, intervall, total) och kan expanderas vid klick.
- Totalsumman per dag = summa av besökens varaktighet (inte first→last-spannet), så "Tors 21/5" visar `16h 40m` (1h17 + 1h0 + 14h23).
- Den lilla legenden "Tid per projekt = tid inom geofence. Boende räknas inte." flyttas in i samma container.

Kartan + ingen separat tabell under den. Sidan blir två kolumner: vänster = veckolistan (bredare), höger = kartan.

### 3. Klick-flöde

- Klick på dagrubrik = välj dagen (uppdaterar kartan) + toggla expansion.
- Klick på besöksrad inuti expansionen = pan/zoom kartan till det besöket (återanvänder befintlig "klicka på rad för pings"-detalj utan att bryta upp containern).

## Tekniska detaljer

**Filer som ändras**
- `src/hooks/staff/useStaffGpsWeekSummary.ts` — skrivs om till `useQueries` × 7 mot `callStaffSnapshotFunction('get-mobile-staff-day-pings', …)`. Returvärdet behåller samma form (`StaffGpsDaySummary[]`) men `places` blir härlett ur `visits` och `durationMin` blir summan av visit-min.
- `src/components/staff/StaffGpsWeekPanel.tsx` — bredare layout, ny "expanderad dag"-sektion, totalrad per dag baserad på besökssumma.
- `src/components/staff/StaffGpsDayRow.tsx` — får `expanded`-prop och rendrar besökstabellen när true; annars bara rubrikraden.
- `src/components/staff/StaffGpsSatelliteMap.tsx` — tar bort `<GeofenceVisitsTable>` och `useOrganizationLocations`-filterringen som dubblerades (snapshot redan filtrerar). Layouten blir `[Veckopanel | Karta]`.
- Den interna `GeofenceVisitsTable`/`VisitPingsDetail` flyttas till en egen liten fil (`src/components/staff/GeofenceVisitRows.tsx`) så att både dagvyn (gammalt fall) och nya expanderade dagraden återanvänder samma JSX.

**Datakontrakt**
- `StaffGpsDaySummary.visits` blir den auktoritativa listan; `places` härleds som `name → summa min` enbart för bakåtkompatibla användningar (gridsökning via testet `staffGpsSatelliteMap.contract.test.ts` ska fortsätta passera — uppdateras vid behov).
- Inget i Time Engine eller staff_day_report rörs — det här är ren visualisering.

**Caching**
- Snapshot-hooken har redan `staleTime: 30s`. Veckans 7 queries använder samma query-key som dagvyn (`['mobile-staff-day-pings', staffId, date]`), så vald dag delar cache mellan vecka och karta → ingen dubbelfetch.

## Test

- Uppdaterar `src/test/staffGpsSatelliteMap.contract.test.ts` så att vecksumman härleds från snapshot-visits, inte från `buildExactGeofenceVisits`.
- Lägger till `src/components/staff/__tests__/StaffGpsWeekPanel.totals.test.tsx` som verifierar att en dag med 3 visits (1h17 + 1h0 + 14h23) visar `16h 40m` totalt och listar alla tre platser i den expanderade vyn.

## Vad som INTE ändras

- Time Engine, time_reports, workday, lönelogik — inget av detta påverkas.
- Backend-snapshot (`get-mobile-staff-day-pings`) — oförändrad. Bara klienten konsolideras.
- Listan av personer, veckonavigationen, kartan, polygon/radie-redigering — oförändrade.
