
# Fix: “Mätning” ska öppna SiteScans kameramätning, inte scan-listor eller LiDAR-historik

## Verifierat i koden

### Var `/m/tools/measure` går idag
I `src/shells/TimeAppShell.tsx` renderar `/m/tools/measure` just nu:
- `MeasurementsPage` från `src/features/site-scans/pages/Measurements.tsx`

### Varför nuvarande entrypoint är fel
Det här är inte ett live mätverktyg.

- `src/features/site-scans/pages/Measurements.tsx`
  - listar senaste scans via `useSiteScansList`
  - texten säger uttryckligen att nya mätningar “startas på LiDAR-enheten och synkas hit automatiskt”
  - alltså: historik/lista för SiteScans, inte kameramätning

- `src/features/site-scans/pages/Scans.tsx`
  - är admin/listvy med filter, sortering, pagination, actions
  - alltså: register/CMS för scans, inte mätverktyg

- `src/features/site-scans/pages/ScanDetail.tsx`
  - visar preview, 3D-modell, punktmoln, terrängdata
  - tillbaka-knappen säger “Tillbaka till SiteScan”
  - alltså: resultat/detaljvy efter scan, inte live mätning

- `src/features/site-scans/components/booking-details/MeasurementsTerrainCard.tsx`
  - visar terräng-metrics från aktiv yta

- `src/features/site-scans/components/booking-details/BookingDrawingTab.tsx`
  - placeholder för 3D-terräng/ritning

- `src/features/site-scans/components/booking/BookingSiteScans.tsx`
- `src/features/site-scans/components/project/ProjectSiteScans.tsx`
  - länkar/scannar kopplade till bokning/projekt

## Slutsats
SiteScans är rätt feature-område, men det finns ingen befintlig sida i SiteScans som motsvarar:
- öppna kameran
- sätt punkt
- flytta punkt
- mäta avstånd på mark eller vägg
- bete sig som iPhone Measure

Det som finns idag i SiteScans är scan-ingest + scan-visning + 3D/terrain-resultat, inte live kameramätning.

## Rätt entrypoint
Den korrekta lösningen är därför inte `Scans.tsx` och inte `Measurements.tsx`.

Den korrekta entrypointen behöver vara en ny liten sida inne i SiteScans-featuren, t.ex.:

- `src/features/site-scans/pages/CameraMeasure.tsx`

Den ska vara Time-appens route för `/m/tools/measure`.

## Minimal implementation

### 1. Skapa en riktig SiteScans-entrypoint för kameramätning
Ny fil:
- `src/features/site-scans/pages/CameraMeasure.tsx`

Den ska:
- öppna mätverktyget direkt, inte lista scans
- visa live kameraområde
- ha tydliga kontroller för att:
  - starta mätning
  - sätta första punkt
  - sätta andra punkt
  - visa aktuellt avstånd
  - nollställa / ny mätning
- kännas som ett verktyg, inte ett register

Om native/live AR-mätning inte är tillgänglig på den aktuella plattformen ska sidan:
- visa tydligt unsupported-state
- inte falla tillbaka till `Scans.tsx` eller `Measurements.tsx`

### 2. Lägg logiken i SiteScans-featuren, inte i mobil-shellen
För att hålla ändringen liten men korrekt:
- routen byts i `TimeAppShell`
- själva verktyget bor i `src/features/site-scans/...`

Om sidan behöver delas upp:
- `src/features/site-scans/components/camera-measure/...`
- `src/features/site-scans/hooks/...`

Men bara om det krävs för att hålla sidan ren.

### 3. Byt routen i `TimeAppShell.tsx`
Ändra endast:
- `/m/tools/measure`

Från:
- `MeasurementsPage`

Till:
- `CameraMeasurePage` / `CameraMeasure`

Behåll wrapper exakt:
- `MobileProtectedRoute`
- `TimeAppLayout`

### 4. Lämna detail-routen orörd
Rör inte:
- `/m/tools/measure/:id`

Den ska fortsätta gå till:
- `src/features/site-scans/pages/ScanDetail.tsx`

Det betyder:
- gamla scan-detaljer fortsätter fungera
- men de är inte längre entrypoint för “Mätning”

### 5. Gör minimal följdjustering i `ScanDetail.tsx`
Eftersom `/m/tools/measure` inte längre är en scan-lista bör tillbaka-knappen inte säga:
- “Tillbaka till SiteScan”

Minsta rimliga fix:
- ändra texten till bara “Tillbaka”
- gärna `navigate(-1)` med fallback till `/m/tools/measure`

Det är en liten lokal justering som undviker missvisande navigation.

## Tekniska detaljer
Nuvarande SiteScans-kod visar att featuren redan äger:
- scan-sessioner
- scan-typer som `lidar_terrain`, `lidar_structure`, `indoor_scan`
- RoomPlan/USDZ-visning
- scan-resultat och assets

Men den äger inte ännu en live “tap-to-measure”-UI.

Det betyder att routingfelet inte kan lösas genom att bara peka på en annan befintlig SiteScans-sida. Den sidan finns inte i koden idag. Därför är den minsta korrekta fixen:
1. skapa en liten ny entrypoint i SiteScans
2. routea `/m/tools/measure` dit
3. låta scan-detaljer ligga kvar separat

## Filer att ändra

### Ändra
- `src/shells/TimeAppShell.tsx`
- `src/features/site-scans/pages/ScanDetail.tsx` (endast tillbaka-knapptext/beteende, om nödvändigt)

### Skapa
- `src/features/site-scans/pages/CameraMeasure.tsx`

### Eventuellt skapa, bara om det behövs
- `src/features/site-scans/components/camera-measure/...`
- `src/features/site-scans/hooks/...`

## Resultat efter fix
När användaren trycker på “Mätning” i Time-appen:
- öppnas inte `Scans.tsx`
- öppnas inte `Measurements.tsx`
- öppnas inte LiDAR-/3D-/historiklistan
- användaren landar direkt i SiteScans kameramätning

Och samtidigt:
- `/m/tools/measure/:id` lämnas kvar
- befintliga detail pages fortsätter fungera
- ingen toast-baserad fake-start
- ingen mellanvy med scan-admin/lista
