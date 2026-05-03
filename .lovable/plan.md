## Problem

Bilden visar att samma rapport säger två olika saker om samma koordinat:

- **Faktiska besök (GPS-pingar)** säger korrekt: `FA Warehouse` (38m kl 03:55 → 04:33).
- **ARBETSDAG / FA Warehouse / Resa** säger fel: `Mälarvägen, Upplands Väsby`.

Det är inte gamla data. Allt räknas live från `staff_location_history` varje gång rapporten öppnas. Skillnaden är:

- Underraden använder den nya pipelinen (`pingPlaceSegments.ts`), som först matchar varje ping mot `organization_locations` (FA Warehouse med radie) — och först därefter använder Mapbox som fallback för okända platser.
- Huvudraderna går genom `GeoAtTime` i `StaffTimeReportsTable.tsx` (rad 101), som tar närmsta ping ±15 min och skickar koordinaten rakt till Mapbox. Mapbox svarar "Mälarvägen" — `GeoAtTime` vet inte att den koordinaten ligger inne i FA Warehouse-radien.

Slutsats: **ingen backfill behövs.** Det finns inget lagrat besöks-resultat i DB. Det räcker att huvudraderna går genom samma motor som underraden, så blir alla dagar bakåt korrekta nästa gång de öppnas.

## Lösning

Gör `GeoAtTime` till en tunn konsument av `pingPlaceSegments` istället för en egen pipeline.

### 1. Ny hook `useDayPlaceVisits(staffId, date)`
- Hämtar dagens pings (`useStaffPingsForDay`) + `useOrganizationLocations`.
- Kör `buildPlaceVisits(pings, knownSites)`.
- Returnerar visits + en `resolvePlaceAt(iso)`-funktion som hittar den vistelse som omfamnar en given tidpunkt (eller närmast inom ±15 min om tiden hamnar i ett gap mellan vistelser).
- Cache:as via React Query-nyckeln på pings — körs alltså en gång per staff/dag, inte en gång per cell.

### 2. Skriv om `GeoAtTime`
- Slå upp visit via `resolvePlaceAt(iso)`.
- Om `visit.knownSite` finns → visa `knownSite.name` (t.ex. "FA Warehouse"). Ingen Mapbox-anrop alls.
- Annars → reverse-geocode `visit.centre` (samma som underraden gör för okända platser), så samma okända plats får samma label överallt.
- Fallback om det inte finns någon visit alls (helt utanför pingfönstret) → behåll dagens beteende ("ingen GPS").

### 3. Konsekvens-städ
- Ta bort eller deprecate `findPingAtTime`-vägen i `GeoAtTime` (den kan finnas kvar för andra konsumenter, men `GeoAtTime` ska inte längre använda den).
- `AddressMapDialog` får fortfarande `coords` — vi skickar `visit.centre` istället för enskild ping.

### 4. Tester
Lägg till ett test i `src/lib/staff/__tests__/pingPlaceSegments.test.ts` som låser:
- Att ett `iso` mitt i en känd-plats-vistelse mappar till `knownSite.name`, oavsett vilken Mapbox-text en enskild ping skulle gett.
- Att `iso` precis vid `start`/`end` också matchar samma vistelse.
- Att ett `iso` i ett gap mellan två vistelser faller tillbaka till närmsta inom ±15 min.

### 5. Ingen DB-migration, ingen backfill
- Inga edge functions ändras.
- Inget skrivs till DB.
- Alla historiska dagar (10+ bakåt) blir automatiskt korrekta nästa gång man öppnar dem, eftersom motorn körs vid render.

## Filer som ändras

```text
src/components/staff/StaffTimeReportsTable.tsx   (skriv om GeoAtTime)
src/hooks/useDayPlaceVisits.ts                   (ny)
src/lib/staff/__tests__/pingPlaceSegments.test.ts (utökas)
```

## Vad detta INTE gör

- Ändrar inte `time_reports`, `location_time_entries`, `staff_location_history` eller någon annan tabell.
- Skapar inte en ny tabell för "lagrade besök".
- Återskapar inte gap-derived restid eller subdivisions (kan göras separat om du vill — säg till).

Vill du att vi också re-kör `create_travel_from_gap` för senaste 10 dagar i samma sväng? Det är en separat åtgärd som faktiskt skriver i DB. Jag har lämnat det utanför denna plan tills du säger till.
