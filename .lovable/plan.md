

# Fix: Mätning öppnar fel sida (visar admin-listan "Scans" istället för mobil mätning)

## Vad som händer nu
- Du trycker **Verktyg → Mätning** i mobilappen.
- `/m/tools/measure` är routad till `src/features/site-scans/pages/Scans.tsx`, som är en **admin-listvy** för SiteScan-plattformen (rubrik: "Scans · Alla 3D- och höjdscans från LiDAR-enheter", med statusfilter, sortering, paginering, MoreHorizontal-meny etc.).
- Det är inte en mätarbetsyta — det är CMS-sidan för site-scans. Därav känslan "den öppnar Ytskanning/Scan istället för Mätning".

## Vad du faktiskt vill ha bakom Mätning
En mobilanpassad **Mätning-vy** som:
1. Visar dina egna senaste mätningar (inte hela orgens lista, ingen status-/sortering/paginering).
2. Har en stor primär CTA: **"Ny mätning"** (startar capture-flödet eller upload-flöde).
3. Listar varje mätning som en mobilkort-rad (titel, datum, status-pil, eventuell preview-thumb).
4. Tap på rad → `/m/tools/measure/:id` (befintlig `ScanDetail` — den fungerar och har korrekt back-knapp).

Admin-listsidan (Scans.tsx) får ligga kvar för desktop SiteScan-modulen (om/när den används där) men slutar vara mobilappens Mätning.

## Tekniska ändringar

**Nya filer:**
- `src/pages/mobile/MobileMeasure.tsx` — ren mobilvy:
  - Hämtar egna scans via befintlig `useSiteScansList` med filter `created_by = current user` och `page_size: 20`.
  - Stor "Ny mätning"-knapp överst (öppnar capture/start-dialog — placeholder toast om backend-flödet inte är på plats än, men knappen finns).
  - Lista i samma mobilstil som `MobileToolsHub` (kort med icon + titel + meta + chevron).
  - Tom state: "Inga mätningar ännu — tryck Ny mätning för att börja".
  - Tap på rad → `navigate('/m/tools/measure/' + id)`.

**Ändrade filer:**
- `src/shells/TimeAppShell.tsx` — `/m/tools/measure` pekar om från `SiteScansPage` till nya `MobileMeasure`. `/m/tools/measure/:id` → `SiteScanDetailPage` orörd.
- `src/features/site-scans/pages/ScanDetail.tsx` — back-knappen går redan till `/m/tools/measure`, ingen ändring behövs.

**Inte rört:**
- `Scans.tsx`, `Dashboard.tsx`, `Operations.tsx`, `Processing.tsx`, `Assets.tsx`, `Sessions.tsx` — desktop SiteScan-modul.
- Scanner-flöden, kamera-flöden, övriga Time-app-routes.
- Edge functions, DB, RLS.

## Resultat
- **Verktyg → Mätning** → en ren mobilvy med "Ny mätning" + dina mätningar.
- Tap på en mätning → samma detalj-sida som idag.
- Tillbaka-knappen → tillbaka till mobil-mätningen.
- Den gamla admin-vyn "Scans" finns kvar för desktop-modulen men är inte längre i Time-appens flöde.

