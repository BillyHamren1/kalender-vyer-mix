

# Fix: Punkter fastnar inte i CameraMeasure

## Vad som är fel i koden idag (`src/features/site-scans/pages/CameraMeasure.tsx`)

1. **Overlay använder `onClick` + `touch-none`**
   - `touch-none` (Tailwind → `touch-action: none`) i kombination med `onClick` gör att tap-eventet i mobil WebView ofta inte konverteras till ett synthetic click. Tappet "fastnar" inte → ingen punkt sätts.
2. **Click-handlern ligger på samma element som `onPointerMove`/`onPointerUp`**
   - Pointer-capture på en barn-punkt + globala move/up på overlay → onClick på overlay kan svälja eller missa.
3. **Inget visuellt fallback om kameran inte fått permission i Capacitor**
   - I native WebView krävs ofta att `getUserMedia` triggas i ett user-gesture. Idag startas det i `useEffect`, så på iOS/Android Capacitor blir `cameraReady` aldrig true → overlayn täcks av "Startar kameran…" och tappar event.

## Fix (minimal, en fil)

Endast `src/features/site-scans/pages/CameraMeasure.tsx`.

### 1. Byt `onClick` → `onPointerDown` på overlay
- Sätt punkten direkt i `pointerdown` (ignorera om event-target är en befintlig punkt → då startar drag i stället).
- Detta funkar identiskt för mus, touch och penna och kringgår click-svalg i WebView.

### 2. Behåll `touch-none` men flytta event-logiken
- Overlay: `onPointerDown` (sätter punkt eller startar drag), `onPointerMove` (drag), `onPointerUp`/`onPointerCancel` (släpper drag).
- Punkter får `data-point-idx` så overlayn vet om tappet träffade en punkt → starta drag i stället för att lägga till ny.
- Ta bort separat `onPointPointerDown` på varje punkt (centralisera på overlay → inga capture-problem).

### 3. Loading-overlay får `pointer-events-none`
- "Startar kameran…" får inte blockera taps om kameran ändå inte hinner igång på desktop preview.

### 4. Starta kameran lazy om autostart misslyckas
- Om `getUserMedia` failar i `useEffect` (t.ex. permission denied/inte user-gesture), visa en "Aktivera kamera"-knapp som startar streamen på klick (uppfyller user-gesture-kravet i Capacitor/iOS Safari).
- Om kameran inte är tillgänglig (preview/desktop utan kamera) ska mätfunktionen **fortfarande funka** mot en svart bakgrund — punkter ska sättas oavsett.

### 5. Säkerställ att punkter renderas ovanpå
- SVG behåller `pointer-events-none`. Punkt-divar tar inte längre egna pointer-events (overlayn hanterar allt via `data-point-idx` lookup).

## Resultat
- Tap på bilden → punkt fastnar direkt (mobil + desktop preview).
- Tap på befintlig punkt + dra → flyttar punkten.
- Kamera-fail blockerar inte mätningen.
- Ingen ny fil, ingen ny route, inga andra delar av appen rörs.

## Filer som ändras
- `src/features/site-scans/pages/CameraMeasure.tsx` (enda filen)

