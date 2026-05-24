# Fix: Geofence-pinnar flyttas vid zoom

## Orsak
I `src/components/staff/RawGpsSatelliteMap.tsx` (rad ~503-546) skapas ett `wrap`-element som innehåller **både** den röda nål-pinnen och text-pillen. `layoutGeofenceBadges()` skriver sedan `transform: translate(-5px, calc(-100% - bumpY))` på hela `wrap` för att undvika att etiketter krockar.

Konsekvens: när `bumpY` växer (många krockar vid utzoomning) flyttas hela elementet — inklusive nålen — uppåt på skärmen, så pinnen visas långt ifrån sin egentliga lat/lng. Det är därför "Kaggeholms slott" hamnar uppe vid Tierp vid utzoomning, men på rätt plats nära Stockholm vid inzoomning.

## Åtgärd
Endast presentation, ingen datalogik ändras.

1. **Dela upp DOM-strukturen per geofence-marker:**
   ```
   root (Mapbox äger transform = lat/lng, anchor 'bottom')
     └─ pin   (röd nål, position:absolute centrerad på ankaret — RÖRS ALDRIG)
     └─ label (text-pillen — denna är det enda som bumpas)
   ```
   - `root` får `anchor: 'bottom'` (eller `'center'`) så Mapbox sätter pinnens spets exakt på lat/lng.
   - Pinnen renderas absolut-positionerad relativt root, utan transform.
   - Labeln är ett eget element som ligger ovanför pinnen och får sin egen transform för stack-bumpY.

2. **Uppdatera `geofenceMarkersRef`:** spara `{ marker, rootEl, pinEl, labelEl }`. `contentEl` ersätts av `labelEl` i layout-loopen.

3. **Uppdatera `layoutGeofenceBadges`:**
   - Mät `labelEl.offsetWidth/Height` istället för wrap.
   - Skriv `transform: translate(<offsetX>, calc(-100% - <pinHeight + bumpY>px))` enbart på `labelEl`.
   - `transformOrigin: 'left bottom'` ligger kvar på labelEl.
   - Sortera fortfarande nordligast först (`pt.y` stigande) så stacken växer uppåt deterministiskt.

4. **Behåll regeln:** ingen transform skrivs någonsin på `rootEl` (Mapbox-marker root). Lägg till kommentar vid pin/label-skapandet som påminner om detta.

5. **Test:** uppdatera `src/components/staff/__tests__/RawGpsSatelliteMap.test.ts` så `buildBadgeStackTransform` fortfarande täcks; den är fortfarande den helper som används av label-bumpen.

## Förväntat resultat
- Röda nålarna ligger kvar exakt på sin lat/lng vid alla zoomnivåer.
- Endast text-pillarna bumpas uppåt för att undvika varandra.
- Kaggeholms slott syns alltid nära Ekerö/Stockholm, oavsett zoom.
- Ingen ändring i pings, visits, geofence-data, Time Engine eller Supabase-queries.
