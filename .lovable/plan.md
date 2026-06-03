## Mål
Initiera Mapbox-kartan i OpsLiveMap direkt i satellitvyn.

## Ändring (en fil)
`src/components/ops-control/OpsLiveMap.tsx`

1. Flytta upp konstanten ovanför map-init `useEffect`:
   ```ts
   const MAP_STYLES = {
     streets: 'mapbox://styles/mapbox/navigation-day-v1',
     satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
   } as const;
   ```
2. I `new mapboxgl.Map({...})`: byt `style: 'mapbox://styles/mapbox/navigation-day-v1'` → `style: MAP_STYLES.satellite`.
3. Bekräfta `useState<'streets' | 'satellite'>('satellite')` (behålls).
4. Bekräfta `toggleMapStyle` använder `MAP_STYLES[next]` så toggle fortsatt funkar.

## Verifiering
- Bygg ska gå igenom (auto-typecheck).
- Preview `/ops-control`: kartan ska öppnas i satellit direkt.
- Toggle-knappen ska fortfarande växla mellan satellit och streets.

Inget annat ändras.