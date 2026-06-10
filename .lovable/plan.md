# Plan

## Vad jag har konstaterat hittills
- Previewn du pekar på visar ett stort, suddigt täckande lager ovanpå satellitbilden.
- Webbkoden har i nuläget nästan ingen riktig terrängrendering i den vy jag hittade; flera ställen visar bara lagrade preview-/mesh-filer eller rena placeholders.
- `/m/tools/measure` gav 404 i previewn, så den direkta live-verifieringen av mätvyn i webben är just nu bruten.
- `BookingDrawingTab` är uttryckligen en placeholder och renderar inte någon riktig 3D-scen alls.
- Det gör att felet mycket väl kan ligga i en av dessa tre nivåer:
  1. felaktig genererad preview-bild,
  2. felaktig mesh/heightmap som används som täcklager,
  3. fel renderordning/material i den riktiga native- eller framtida canvasscenen.

## Det jag kommer göra
1. **Identifiera den verkliga kanoniska terrängvyn**
   - Fastställa exakt vilken route/komponent som användarna faktiskt använder när de ser den suddiga terrängmassan.
   - Koppla den till rätt datakälla: `preview_image`, `heightmap`, `mesh`, `point_cloud` eller native SceneKit/AR-output.

2. **Spåra vilket lager som döljer terrängförändringarna**
   - Gå igenom hela renderkedjan från `site_scans` / `booking_site_surfaces` till visning.
   - Kontrollera om ett extra fill-/mesh-/masklager läggs ovanpå hela ytan.
   - Kontrollera om fel assettyp används som primär visning, t.ex. en grov/suddig preview istället för riktig terrängdata.

3. **Separera dataproblem från renderproblem**
   - Verifiera om terrängförändringarna faktiskt finns korrekt i lagrade assets men döljs i UI.
   - Om previewbilden redan är fel: fixa visningslogiken så att den inte använder den som “sanning”.
   - Om meshen är fel: spåra var den skapas/länkas och säkra att rätt fil väljs.

4. **Fixa den faktiska orsaken**
   - Om problemet är overlay/material/renderordning: justera scenen så att täcklagret inte kan ligga över allt.
   - Om problemet är fel previewkälla: byt prioritering så att skarpa terrängdata visas först.
   - Om problemet är att webben saknar riktig terrängvisning: ersätta placeholdern med en riktig diagnostisk viewer så att terränglager kan granskas utan att ett dolt previewlager maskerar allt.

5. **Lägga in hårda skydd mot regression**
   - Skapa test/kontraktstest för asset-prioritering och val av terrängkälla.
   - Lägga in tydlig fallback/debug-info i UI så det går att se vilken asset som faktiskt renderas.
   - Testa direkt i preview efter ändring och köra testsviten efter större fixen.

## Förväntat resultat
- Den suddiga massan försvinner eller flyttas bort från primärvyn.
- De verkliga terrängförändringarna blir synliga igen.
- Det blir tydligt i UI vilken terrängkälla som visas, så samma fel inte kan gömma sig igen.

## Tekniska detaljer
- Redan granskade filer visar att:
  - `src/features/site-scans/pages/ScanDetail.tsx` visar signed `preview_image`, `mesh` och `point_cloud`.
  - `src/features/site-scans/components/booking-details/BookingDrawingTab.tsx` är bara placeholder, inte riktig terrängcanvas.
  - `src/features/site-scans/components/scan-detail/UsdzViewer.tsx` är också stub/placeholder.
  - Native iOS-koden i `ios/App/App/SiteScanMeasure` verkar vara AR-mätning, inte den satellit-/terrängoverlay som syns i din bild.
- Därför kommer jag i implementationen rikta in mig på både:
  - fel asset-prioritering i site scan-visningen,
  - samt eventuell separat terrängviewer som idag använder fel lager ovanpå kartan/canvasen.

```text
Data -> site_scans / booking_site_surfaces
     -> preview_image / heightmap / mesh / point_cloud
     -> viewer choice / render order
     -> det suddiga lagret måste bort eller nedprioriteras
```

När du godkänner planen går jag vidare och fixar det på riktigt.