
## Mål
Ersätt de stora "Plats/Projekt · namn · radie"-badgesen på `/staff-management/gps-satellite-map` med en liten röd nålpin (som referensbilden) och endast projektnamnet i en clean text-badge bredvid.

## Ändringar (endast `src/components/staff/RawGpsSatelliteMap.tsx`)

1. **Filtrera bort boende/locations**
   - I HTML-marker-loopen: rendera badge ENDAST för geofences där `kind === 'project'` (eller motsvarande projekt-typ). Hoppa över `location`/boende/organization_locations helt — de syns redan som cirkel på kartan om de finns, men får ingen text-pin.

2. **Ny markup per pin**
   ```
   [🔴 pin 12px]  ProjektnamnXYZ
   ```
   - Pin: liten röd SVG/CSS-cirkel med tunn stjälk, ~12–14px hög, vit `1px` ring, mjuk skugga. Inspirerad av uppladdad referensbild (röd boll + grå nål).
   - Label: bara `name`. Ingen "Projekt"-chip, ingen "· 150 m"-chip, ingen kind-prefix.
   - Stil: vit/blurred pill bakom texten, `padding: 2px 8px`, `font-size: 11px`, `font-weight: 600`, `color: hsl(var(--foreground))`, `border-radius: 999px`, subtil skugga. Max-width 160px, ellipsis.
   - Pin och label sitter på samma rad (`display:flex; gap:6px; align-items:center`), ankrat med pin-spetsen i geofence-centrum (`translate(-6px, -100%)` så spetsen pekar på punkten).

3. **Zoomskalning**
   - Behåll `applyZoomVisibility` men sänk skalan: 0.7x vid zoom 11 → 1.3x vid zoom 22 (mindre aggressiv än nuvarande 0.85–2.6x) så de aldrig blir "JÄTTESTORA".

4. **Cleanup**
   - `clearGeofenceMarkers()` oförändrad.
   - Ta bort kind-chip-koden och radie-chip-koden helt.

## Inget annat rörs
Filter-logik för "aktuella projekt", källdata och layers påverkas inte — bara visuell rendering av badge/pin.
