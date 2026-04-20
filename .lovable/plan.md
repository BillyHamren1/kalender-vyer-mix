

## Fix: personalen syns inte på OpsLiveMap

### Verifierat med data
- 13 staff har `staff_locations` med giltiga lat/lng (kluster vid Märsta ~59.49,17.85 och Bålsta ~59.65,17.72).
- Statsraden visar korrekt "13 personal · 12 på plats" → datat når komponenten.
- Men WebGL-lagren (`ops-staff-marker-layer`) ritar inte ut markörerna på kartan.

### Trolig orsak
`OpsLiveMap` använder WebGL-`circle`-lager (inte HTML-markörer) för staff. Det är skört av tre skäl:

1. **`m.isStyleLoaded()`-guard utan retry.** Effekten på rad 274–275 hoppar tidigt om stilen inte är klar. När `styleRevision` bumpas via `style.load` är `locations` ofta fortfarande `[]` (queryt klart senare), så effekten kör igen — men ibland med tom data, och nästa körning sker innan `isStyleLoaded` blir true igen.
2. **Layers återanvänds men source-datan kan bli stale efter `setStyle()`** (kart-stil-toggle). `setStyle` rensar alla layers/sources; `getSource(STAFF_SOURCE_ID)` returnerar undefined och vi `addSource` igen — men layers återanvänds inte, alla kontroller är `if (!m.getLayer(...))` → ok. Men om `isStyleLoaded()` är false vid omkörning hoppar vi och layers återskapas aldrig.
3. **GPS-status missvisar.** "Recent GPS"-pricken kräver `lastReportTime` < 5 min, men `lastReportTime` = `time_reports.created_at` (sätts en gång när timern startas — inte en GPS-puls). Status-färgen baseras på `isWorking` (har time_report idag) → de flesta blir `on_site` (grönt) men markeras grått om bokning saknas. `isOffline`-flaggan beräknas men används inte i färgen.

### Vad jag bygger

**1. Robust layer-rendering i `OpsLiveMap.tsx`**
- Ersätt `if (!isStyleLoaded()) return;` med en kö: om stilen inte är klar, registrera engångs-`once('idle', ...)` som kör samma render-funktion. Garanterar att layers alltid landar.
- Lägg till `console.debug('[OpsLiveMap] render staff', { count, sample })` i render-effekten så vi i konsollen direkt ser om datan når Mapbox.
- Säkerställ att layers läggs ovanpå basemap-symboler genom att skicka `beforeId` = första symbol-laget (om finns), så markörer aldrig döljs av road-labels.

**2. Fallback: HTML-markörer om WebGL-lager fallerar**
- Efter `addLayer`-blocket: kolla `m.getLayer(STAFF_MARKER_LAYER_ID)`. Om det saknas (mycket ovanligt men möjligt vid style-race) → fall tillbaka till `mapboxgl.Marker` med samma styling som `StaffMapView` redan använder. Markörerna sparas i en ref för cleanup.

**3. Korrekt status-färg per faktisk GPS-färskhet**
- `getStaffStatus` får ny logik:
  - `isOffline` (>10 min sedan GPS) → grå "Inaktiv"
  - `isWorking` (har time_report idag) → grön "På plats"  
  - `bookingId` med `isActive` → gul "På väg"
  - annars → grå "Inaktiv"
- "Recent GPS"-pricken (gröna lilla satellit-indikator) baseras nu på `loc.isOffline === false` istället för `lastReportTime`. Det matchar verkligheten — vi har faktisk `updated_at` i datan.

**4. Lägg `isOffline` i feature-properties**
- Skickas till layern och används i `circle-opacity` (offline = 0.55) så användaren ser direkt vilka som är "kalla" pricar utan att klicka.

### Berörda filer
- `src/components/ops-control/OpsLiveMap.tsx` — robust render + HTML-fallback + status-fix
- `src/services/planningDashboardService.ts` — exponera `isOffline` (finns redan i `StaffLocation`-typen, säkerställ att alla code-paths sätter det korrekt; en av två branches saknar fältet idag)

### Inte i denna ändring
- Ingen ändring av `staff_locations`-schema, ingen DB-migration.
- Ingen ändring av GPS-rapporteringsfrekvens (kvar på 30 s från mobilen).
- `StaffMapView`/`WarehouseStaffTimeline` rörs inte.

### QA efter implementation
1. Öppna `/ops-control` → 12–13 färgade markörer ska synas vid Märsta + Bålsta-klustren.
2. Hovra på en markör → tooltip + popup öppnas.
3. Toggla satellit-/kart-stil → markörerna stannar kvar (inte tomt efter style-byte).
4. Stäng laptop, vänta 11+ min, öppna igen → de markörer som inte uppdaterats blir ljusgrå/halvtransparenta (offline).
5. Konsoll: `[OpsLiveMap] render staff { count: 13, sample: ... }` ska loggas vid varje uppdatering.
6. Klicka på en markör → staff-panelen öppnas till höger med namn, status, senast uppdaterad.

