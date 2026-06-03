## Mål
Lås upp kartinteraktioner i OpsLiveMap (scroll-zoom, drag, dubbelklick, touch/pinch).

## Ändring (en fil)
`src/components/ops-control/OpsLiveMap.tsx`

1. Direkt efter `new mapboxgl.Map(...)` i init-`useEffect`, aktivera alla handlers explicit:
   ```ts
   const m = map.current;
   if (m) {
     m.scrollZoom.enable();
     m.boxZoom.enable();
     m.dragRotate.enable();
     m.dragPan.enable();
     m.keyboard.enable();
     m.doubleClickZoom.enable();
     m.touchZoomRotate.enable();
   }
   console.debug('[OpsLiveMap] Map interactions enabled', {
     scrollZoom: true, dragPan: true, doubleClickZoom: true, touchZoomRotate: true,
   });
   ```
2. Lägg `style={{ touchAction: 'none' }}` på `<div ref={mapContainer} ...>`.
3. Snabbgranska overlays (toolbar, legend, panels, tooltips, loading) — säkerställ att inga `inset-0` ligger ovanpå kartan med pointer-events aktiva när `mapReady` är true; loading endast vid `isLoading || !mapReady`.
4. Rör inget annat (pins, satellitstil, layout).

## Verifiering
- Auto-typecheck/build passar.
- Preview `/ops-control`: scroll zoomar, drag panorerar, dubbelklick zoomar in, console visar debug-raden.