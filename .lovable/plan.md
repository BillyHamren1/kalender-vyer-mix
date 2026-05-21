## Mål

Bygg om `/staff-management/gps-satellite-map` till en två-kolumns-vy:
- **Vänster**: person-väljare + veckonavigering + lista över veckans 7 dagar med starttid, besökta platser, sluttid och arbetade timmar.
- **Höger**: nuvarande satellitkarta som visar vald dags rörelser (oförändrad logik).

Datakällan är **densamma som kartan idag** — `useStaffGpsPingsForDay` + `buildExactGeofenceVisits` (samma `geofenceVisits` som redan visas i `GeofenceVisitsTable`). Ingen ny tolkning, inga `time_reports`, inget Time Engine. Kartan visar fortfarande exakt det den visar nu.

## Layout

```text
┌───────────────────────────────────────────────────────────────────┐
│ PageHeader: GPS satellitkarta                                     │
├──────────────────┬────────────────────────────────────────────────┤
│ Person ▼         │  [Lager-checkboxar] [pings/geofences-badges]   │
│ Markuss Minalto  │  ┌──────────────────────────────────────────┐ │
│                  │  │                                          │ │
│ ◀ V.20 2026 ▶    │  │           Satellitkarta                  │ │
│ ─────────────    │  │       (vald dags pings + visits)         │ │
│ ● Mån 18/5       │  │                                          │ │
│   08:15 → 21:13  │  └──────────────────────────────────────────┘ │
│   Westmark, FA   │  Geofence-besök (tabell) — för vald dag       │
│   Warehouse      │  Pings-tidslinje (tabell) — för vald dag      │
│   12h 58m        │                                                │
│ ─────────────    │                                                │
│   Tis 19/5  —    │                                                │
│ ─────────────    │                                                │
│   Ons 20/5  —    │                                                │
│ ...              │                                                │
└──────────────────┴────────────────────────────────────────────────┘
```

Vänsterpanelen är ~320 px bred, scrollbar; kartan tar resten.

## Filer

**Nya:**
- `src/hooks/staff/useStaffGpsWeekSummary.ts` — hämtar pings för 7 dagar parallellt (React Query, en query per dag återanvänder befintlig `useStaffGpsPingsForDay`-cache via `useQueries`) + dagens `knownSites`. Returnerar per dag: `{ date, pingsCount, firstIso, lastIso, durationMin, visits: PlaceVisit[] }` där `visits` byggs med samma `buildExactGeofenceVisits` som kartan.
- `src/components/staff/StaffGpsWeekPanel.tsx` — vänsterpanelen: person-select (återanvänder samma `staffQuery` + filter), vecknavigering (◀ V.NN ÅÅÅÅ ▶, "Idag"-knapp), 7 dagsrader. Aktiv dag highlightad. Klick sätter `date`.
- `src/components/staff/StaffGpsDayRow.tsx` — en dagsrad: veckodag + datum, start `HH:MM`, slut `HH:MM`, total `Xh Ym`, lista av distinkta platsnamn från `visits` (komma-separerad, trunkerad). Tom dag visar bara "—".

**Ändras:**
- `src/components/staff/StaffGpsSatelliteMap.tsx`:
  - Bryt ut nuvarande topbar-filter (Person/Visa/Datum/Lager) — Person+Datum flyttas in i vänsterpanelen, Lager-checkboxar + badge-rad stannar ovanför kartan.
  - Wrappa i `flex` med `<StaffGpsWeekPanel>` till vänster och kart-kolumnen till höger. Vänsterpanelen får `staffId`, `date`, `onStaffChange`, `onDateChange`, samt `filterMode`/`onFilterChange` (flyttas dit).
  - Kart-kolumnen behåller exakt nuvarande `RawGpsSatelliteMap` + `GeofenceVisitsTable` + `PingTimelineTable` — ingen ändring av karta eller tolkning.

**Tester (nya):**
- `src/test/staffGpsWeekSummary.test.ts` — verifierar att summary räknar `firstIso`/`lastIso` från första/sista ping och `visits` från `buildExactGeofenceVisits`, samt att tom dag ger `null`/`0`.
- Utöka `src/test/staffGpsSatelliteMap.contract.test.ts` med kontroll att `StaffGpsWeekPanel.tsx` inte importerar något Time Engine / dayJournal-lager (samma FORBIDDEN-lista).

## Tekniska detaljer

**Veckoberäkning:** måndag-start (sv-SE), `useWeekDays(weekStart)` finns redan.

**Start/slut per dag:**
- `firstIso` = `min(pings.recorded_at)` (samma som `summary.first` i nuvarande topbar).
- `lastIso` = `max(pings.recorded_at)`.
- `durationMin` = `(lastTs - firstTs) / 60_000`, avrundat. Inga rastavdrag, ingen tolkning — bara span mellan första och sista ping för dagen. Visas som `Xh Ym`.

**Platser per dag:** unika `visit.placeName` från `geofenceVisits`, i kronologisk ordning, max 3 visas + `+N` om fler.

**Prestanda:** 7 parallella `useQuery`-anrop via `useQueries`. Återanvänder `staffPingsForDay`-cache så den valda dagen redan är varm när användaren klickar runt. `knownSites` hämtas en gång för aktiv dag (kartan), och separat per dag för panelens visits-beräkning (samma hook, billig på cache).

**Default:** Initial vecka = veckan som innehåller `DEFAULT_DATE_ISO` (`2026-05-16`) tills användaren navigerar.

## Vad som INTE ändras

- Karta, `RawGpsSatelliteMap`, `buildExactGeofenceVisits`, `useStaffGpsPingsForDay`, `useDayKnownSites` — orörda.
- Ingen ny edge function, ingen migration, inga DB-skrivningar.
- Sidans isolation-kontrakt (`staffGpsSatelliteMap.contract.test.ts`) hålls — vi importerar fortfarande inget från Time Engine / dayJournal.

## Verifiering

1. `bunx vitest run src/test/staffGpsWeekSummary.test.ts src/test/staffGpsSatelliteMap.contract.test.ts`
2. Navigera till `/staff-management/gps-satellite-map`, verifiera att vänsterpanelen visar Markuss vecka 20 2026, att 18/5 är markerad (om det är dagen med data), och att klick på en annan dag uppdaterar kartan.
