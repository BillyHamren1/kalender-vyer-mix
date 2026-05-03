# GPS-besök: gå tillbaka till rådata som sanning

## Vad jag har bekräftat
Jag har nu gått igenom hela flödet från indata till UI:

1. `mobileApi.getMovementForDay` hämtar råpingar från `staff_location_history` via edge-funktionen `get_movement_for_day`.
2. `useStaffPingsForDay` mappar bara om dessa till `{ lat, lng, recorded_at, accuracy }`.
3. `GpsStopsRows.tsx` gör sedan all tolkning direkt i komponenten:
   - matchar ping mot `organization_locations`
   - annars skapar egen `coordCellKey` (~110 m grid)
   - segmenterar med egen `segmentByPlace`
   - reverse-geocodar okända segment
   - slår sedan ihop igen på slutlig textlabel
4. Samma vy använder också `useReverseGeocode` på andra ställen (`GeoAtTime`, `JournalPlaceCell`), vilket betyder att UI:t fortfarande blandar “rå position” med “Mapbox-gissning”.

Jag har också verifierat faktisk data för användaren i screenshoten:
- `staff_members.id = staff_1775736478460_k1q8idrvv`
- `organization_locations` innehåller `FA Warehouse` på `59.4914494330173, 17.8553564370097` med `radius 200m`
- råpingarna 03:55 ligger vid lagret i Väsby
- råpingarna 05:10–05:24 ligger vid `59.2947, 18.0796` (Johanneshov/Arenavägen)

Alltså: datan pingar korrekt. Problemet är tolkningen i klienten.

## Rotproblemet
`GpsStopsRows.tsx` har blivit ansvarig för för många steg samtidigt.

Den försöker både:
- avgöra vad som är samma plats
- avgöra vad som är brus
- avgöra när ett besök börjar/slutar
- välja label
- reverse-geocoda fallback
- slå ihop segment igen efteråt

Det gör att sanningen blir utsmetad mellan flera heuristiker i samma fil. Även om pingsen är rätt blir resultatet svårförutsägbart.

## Plan
### 1. Flytta all platssegmentering ur komponenten
Skapa en liten ren helper i `src/lib/staff/` som får:
- råpingar
- kända platser (`organization_locations`)

Och returnerar färdiga “vistelser”:
- `start`
- `end`
- `durationMin`
- `placeKey`
- `placeType` (`known_site` | `unknown_cell`)
- `siteId` / `siteName`
- representativ koordinat
- `pingCount`

`GpsStopsRows.tsx` ska bara rendera färdiga vistelser, inte innehålla själva sanningsmotorn.

### 2. Gör ordningen helt entydig
Ny pipeline:
1. sortera råpingar kronologiskt
2. märk varje ping med platsidentitet
   - först känd plats (`organization_locations`)
   - annars okänd plats-cell
3. bygg sammanhängande segment endast på platsidentitet
4. första ping i segment = IN
5. sista ping i segment = UT
6. därefter eventuell label-fallback för okända platser

Detta blir exakt den ordning du efterfrågar: först adress/plats per ping, sedan vistelse.

### 3. Sluta slå ihop på adress-text
Ingen merge ska längre ske på reverse-geocodad text.

Om två segment ska räknas som samma plats ska det bero på stabil identitet:
- samma `site:${id}` för känd plats
- samma okända cell / explicit koordinatbaserad platsnyckel för okänd plats

Mapbox-text får bara vara presentation, aldrig logik.

### 4. Gör okända platser mer transparenta
För platser som inte matchar en känd site:
- använd reverse geocode endast som label
- behåll underliggande stabil nyckel separat
- om geocode saknas eller känns opålitlig, visa koordinat eller enkel fallback istället för att låta texten styra segmenteringen

### 5. Städa upp filansvaret i UI:t
Efter refaktorn:
- `GpsStopsRows.tsx` blir tunn render-komponent
- plats-/segmentlogik ligger i en liten helperfil
- ev. känd plats-matchning kan få egen liten helper om det behövs

Det gör filen mindre, lättare att felsöka och enklare att verifiera mot rådata.

### 6. Lås beteendet med tester
Lägg tester för minst dessa fall:
- heldag på FA Warehouse i Väsby => en känd plats, inte Solna
- Väsby → Johanneshov → Väsby => tre tydliga block med rätt IN/UT
- enstaka GPS-spike mitt i vistelse => får inte bryta vistelsen
- två okända platser med samma geocode-text => får inte slås ihop bara för att texten matchar

## Berörda filer
- `src/components/staff/GpsStopsRows.tsx`
- ny helper, t.ex. `src/lib/staff/pingPlaceSegments.ts`
- ev. liten helper för site-matchning i samma fil eller separat
- testfil i `src/lib/staff/__tests__/...`

## Förväntat resultat
Efter ändringen ska tabellen vara mycket enklare att lita på:
- råpingarna är sanningen
- känd plats i Väsby visas som Väsby/FA Warehouse
- första ping på plats blir IN
- sista ping på plats blir UT
- reverse geocode kan inte längre “ta över” och skriva om verkligheten
- komponenten blir mindre och mer hanterbar

## Teknisk detalj
Jag kommer inte bygga vidare mer i nuvarande komponentlogik. I stället föreslår jag en liten ren kärna för “ping -> plats -> vistelse”, och sedan renderar UI:t bara resultatet.