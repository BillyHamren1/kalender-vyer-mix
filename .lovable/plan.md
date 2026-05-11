## Problem

I dialogen "Ny fast plats" på `/ops-control` står kartrutan grå, utan tiles, utan spinner och utan felmeddelande. Token-edge-funktionen svarar OK (annars hade röd `loadError`-text visats), men `mapboxgl.Map` initieras innan `DialogContent` är fullt animerad/utvikt och hamnar då med ett 0×0 WebGL-canvas. När `m.on('load')` skjuts sätts `tokenLoading=false`, men inga tiles ritas ut eftersom canvas är tom — och de tre `m.resize()`-anropen råkar köras innan Radix-animationen är färdig på vissa preview-storlekar.

Ingen logik utanför kartkomponenten är trasig — det är bara init-sekvensen som behöver bli robust.

## Fix (endast `src/components/ops-control/GeofenceMapEditor.tsx`)

1. **Vänta tills containern har storlek innan `new mapboxgl.Map(...)`**
   Efter att token är hämtad: pollar via ResizeObserver/`requestAnimationFrame` tills `containerRef.current.clientWidth > 0 && clientHeight > 0` (max ~2 s). Då först skapas mapinstansen.

2. **Tvinga resize i flera steg + på `idle`-event**
   Behåll de tre `resize()`-stegen, men lägg även till `m.once('idle', () => m.resize())` och en sista `setTimeout(800)` för att täcka långsamma dialog-animationer.

3. **Tydligare style-felhantering**
   Bredda `m.on('error')`-fallbacken till streets-v12: alla style-/sprite-/tile-fel (inte bara 401/403) ska byta style och logga warning. Om `load` aldrig fyrar inom 8 s → sätt `loadError = "Karta tog för lång tid att ladda — försök igen."` så att rutan inte är tyst grå.

4. **Manuell omladdningsknapp i fel-läget**
   I `loadError`-blocket: lägg till liten "Ladda om kartan"-knapp som river ner `mapRef.current` och kör om init-effekten (via en intern `reloadKey`-state).

5. **Mindre städ**
   - Säkerställ att `ro.disconnect()` körs även om `mapRef.current` redan satts till null.
   - Bibehåll alla diff-skydd (gör inget om `cancelled`).

## Vad som INTE rörs

- Ingen UI-ombyggnad av dialogen (`OrganizationLocationsManager.tsx`).
- Ingen ändring av `mapbox-token`-edge-funktionen.
- Ingen ändring av Mapbox-token, secrets eller adressökning.
- Ingen ändring av `polygonAreaM2` / `polygonCentroid` / RLS / DB.
- Inget rört utanför `GeofenceMapEditor.tsx`.

## Verifiering

- Ladda `/ops-control` → "Lägg till fast plats" → dialog öppnas → satellitkartan visas inom ~1 s.
- Skriv "Storgatan 1, Stockholm" + sök → kartan flyger dit.
- "Cirkel" + radie 100 → lila cirkel ritas ut.
- "Rita polygon" → klickbara hörn fungerar; yta visas.
- Toggle Karta/Satellit byter style utan att tappa polygon.
- Stänga + öppna dialog igen ska fortsatt rita kartan korrekt.
