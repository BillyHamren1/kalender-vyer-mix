
# Bygg om mätverktyget korrekt: använd den riktiga native SiteScan-mätningen i EventFlow Time

Du har rätt i sak: mätningen finns och fungerar i din SiteScan-app. Det som är fel här är att `/m/tools/measure` i EventFlow Time idag pekar på en helt separat React-fil (`src/features/site-scans/pages/CameraMeasure.tsx`) som försöker imitera mätning i webblagret. Den matchar inte den riktiga SiteScan-mätningen.

Den fungerande mätkoden jag hittade finns i det separata projektet [ScanSphere Manager](/projects/f8cefc6d-caa9-4a1d-99b0-187ae6ebaa20), framför allt:
- `native/SiteScanMobile/Screens/MeasureScreen.swift`
- `native/SiteScanMobile/Screens/SurfaceScanScreen.swift`

## Målet
Göra `/m/tools/measure` i EventFlow Time till ett riktigt iPhone/Capacitor-flöde som använder native SiteScan-mätning på iOS, i stället för den trasiga webbmätningen.

## Vad som byggs om

### 1. Ta bort den falska webb-mätningen från huvudflödet
Den nuvarande filen:
- `src/features/site-scans/pages/CameraMeasure.tsx`

ska inte längre vara själva mätmotorn för iPhone. Den innehåller idag freeze/snapshot, lokal punkt-state och web-pointerlogik som inte är samma sak som din riktiga app.

I stället gör jag den här uppdelningen:

- **iPhone + Capacitor + Time-app**: öppnar native SiteScan-mätning
- **Web/preview/desktop**: visar tydlig fallback/instruktion, inte låtsasmätning

### 2. Porta in native Measure från SiteScan till Time-appens iOS-target
Jag flyttar in och anpassar native-koden från SiteScan-projektet till detta projekts iOS-app så att Time-appen kan öppna samma typ av mätvy som i din fungerande app.

Planerade native delar:
- Portera `MeasureScreen.swift`
- Portera beroenden som krävs för att den ska fungera, t.ex. relevanta:
  - `ARSessionManager`
  - `MeasureViewModel`
  - AR/overlay/views som används av `MeasureScreen`
  - nödvändiga modeller/state/services från SiteScanMobile

### 3. Lägg en tunn native bridge mellan React och Swift
I React ska `/m/tools/measure` inte längre försöka mäta själv. Den ska anropa en native bridge, ungefär så här:

```text
React route (/m/tools/measure)
        ↓
SiteScan native bridge
        ↓
SwiftUI MeasureScreen / SurfaceScanScreen
        ↓
sparar/synkar resultat
        ↓
React visar listan/detaljen
```

Det ger rätt ansvarsfördelning:
- React = navigation, lista, scan-detaljer
- Native iOS = själva mätningen

### 4. Behåll nuvarande SiteScan-lista och detaljvyer i React
Det som redan finns i EventFlow Time för listning/visning av scans ska fortsätta användas:
- `src/pages/mobile/MobileMeasure.tsx`
- `src/features/site-scans/hooks/useSiteScans.ts`
- `src/features/site-scans/hooks/useBookingSiteScans.ts`
- `src/features/site-scans/hooks/useBookingSiteSurfaces.ts`
- `src/features/site-scans/pages/ScanDetail.tsx`

Det innebär:
- “Ny mätning” öppnar native mätning på iPhone
- färdiga/synkade mätningar visas fortsatt i React-listan
- detaljvyn fortsätter öppna scan-resultat som idag

### 5. Gör routen korrekt i TimeAppShell
Nuvarande route:
- `src/shells/TimeAppShell.tsx`
- `/m/tools/measure` → `CameraMeasure`

ska byggas om så att den i stället går till en launcher/container som:
- känner av iOS/Capacitor
- öppnar native Measure-flödet
- fallbackar snyggt i preview/webb

Ingen mer webbkamera-frysning. Ingen lokal punktdragning i React för iPhone-läget.

## Filer som ska ändras

### Befintliga filer
- `src/shells/TimeAppShell.tsx`
- `src/pages/mobile/MobileMeasure.tsx`
- `src/features/site-scans/pages/CameraMeasure.tsx` (ersätts kraftigt eller avvecklas som riktig mätvy)
- eventuellt `capacitor.config.ts` / `capacitor.time.config.ts` om bridge/native-registrering kräver det

### Nya React-filer
- `src/features/site-scans/native/useNativeSiteScan.ts`
- `src/features/site-scans/pages/NativeMeasureLauncher.tsx`
- eventuellt `src/features/site-scans/types/native-measure.ts`

### Nya iOS-filer
Under `ios/App/App/` och/eller en ny native modul:
- bridge/plugin för att öppna SiteScan Measure
- wrapper/controller för SwiftUI-vyn
- porterade Swift-filer från SiteScanMobile som Measure behöver
- eventuella delade modeller/viewmodels/services från SiteScan-projektet

## Exakt hur interaktionslogiken blir robust
Den robusta logiken ligger då i native AR/Measure-lagret i Swift, inte i React-pointer-events.

Det betyder:
- inget `onPointerDown/onPointerMove`-beroende i WebView för iPhone-mätning
- inga punkter som “försvinner” p.g.a. React rerender eller touch-capture
- inget snapshot-läge som bryter flödet
- punktfäste, tracking, crosshair och mätstatus drivs av native session/state som i din fungerande app

## Exakt hur kameralogiken blir robust
Kameran hanteras av den native iOS-delen i stället för `getUserMedia()` i React.

Det ger:
- korrekt iOS permission-flöde
- AR/session-start i rätt native lifecycle
- ingen WebView-beroende kamerastart
- samma typ av kamerabeteende som din fungerande SiteScan Measure

## Exakt hur vi förhindrar att punkter tappas/försvinner
I den nya lösningen tas punktstate bort från den bräckliga React-sidan och flyttas till native Measure-sessionen.

Det förhindrar problem som idag orsakas av:
- local/session storage
- React rerenders
- pointer capture i overlay
- frozen-image state
- splittrad kalibrering vs punktmätning i samma webblager

## Exakt hur kalibreringsläget fungerar efter ombyggnad
Kalibrering ska följa native SiteScan-logiken, inte den nuvarande webbvarianten där kalibrering och vanliga punkter blandas i samma React-ritlager.

Det betyder:
- kalibrering hanteras som separat mode i native session/viewmodel
- vanliga mätpunkter och kalibreringsinteraktion hålls åtskilda i state
- React visar bara resultat/status, inte själva kalibreringsmotorn

## Leveranssteg

### Steg 1 — Portering
Porta in native mätmodulen från ScanSphere Manager till detta projekts iOS-app.

### Steg 2 — Bridge
Bygg React ↔ native-brygga för att öppna mätning från `/m/tools/measure`.

### Steg 3 — Route/UX
Byt ut nuvarande route så att Time-app på iPhone öppnar native Measure, medan web/preview får en tydlig fallback.

### Steg 4 — Resultatkoppling
Säkerställ att sparade/synkade mätningar fortsatt visas i `MobileMeasure` och `ScanDetail`.

### Steg 5 — Avveckla trasig webblogik
Ta bort freeze/snapshot-beteendet som primär mätväg från `CameraMeasure.tsx`.

## Kort verifiering som ska göras efter implementation
- kameran startar via native iOS-mätvy
- punkt går att skapa
- punkt går att dra direkt
- punkter ligger kvar stabilt i sessionen
- mätflödet känns robust i EventFlow Time på iPhone/Capacitor
- `/m/tools/measure/:id` fortsätter visa synkade resultat i React

## Viktig konsekvens
Det här är inte en “punktfix” i en TSX-fil. Det är en arkitekturkorrigering:
- den riktiga mätningen tillbaka till native iOS
- React tillbaka till launcher/lista/detaljvisning

Det är den väg som matchar att du redan har en fungerande SiteScan-app byggd på samma kodfamilj.
