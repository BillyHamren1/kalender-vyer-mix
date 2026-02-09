
# Riktiga vägbaserade rutter pa kartan

## Vad andras
Istallet for raka "helikopterlinjer" mellan pickup och leverans kommer kartan visa **faktiska vagbaserade rutter** - med kurvor, motorvagar och rondeller precis som i Google Maps.

## Hur det fungerar

1. **Mapbox Directions API** anropas for varje transport-tilldelning med pickup- och leveranskoordinater
2. API:t returnerar en **encoded polyline** med den faktiska vagrutten
3. Polyline-geometrin ritas ut pa kartan som en snygg, foljsam rutt langs vagarna

## Tekniska detaljer

### Fil: `src/components/logistics/widgets/LogisticsMapWidget.tsx`

**Ersatt logik (rad 141-206):**
- Ta bort den manuella `LineString` med bara tva punkter (rak linje)
- For varje transport-tilldelning med giltiga koordinater:
  1. Anropa Mapbox Directions API: `https://api.mapbox.com/directions/v5/mapbox/driving/{pickup};{delivery}?geometries=geojson&overview=full&access_token=...`
  2. Anvanda det returnerade `geometry`-objektet (som innehaller alla vagpunkter) som GeoJSON-kalla
  3. Rita rutten med samma styling (orange streckad linje med outline)
- Behalla pickup- och leveransmarkorerna som de ar
- Lagga till felhantering: om Directions API misslyckas, falla tillbaka pa rak linje

**Cachning och prestanda:**
- Ruttdata cachas i en `useRef`-map (`routeCache`) sa att samma rutt inte hamtas om igen vid filter-byten
- API-anrop gors parallellt med `Promise.allSettled` for att inte blocka renderingen
- Max 10 rutter hamtas at gangen for att undvika rate-limiting

**Uppdatering av popup-info:**
- Visa kopavstand och beraknad tid i popupen (t.ex. "32 km, ~28 min")

### Ingen ny edge function behovs
Mapbox Directions API anropas direkt fran klienten med den publika Mapbox-token som redan hamtas via `mapbox-token`-funktionen. Ingen server-side-proxy kravs for detta.
