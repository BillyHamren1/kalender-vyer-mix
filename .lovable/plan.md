## Mål

Gör /ops-control snabbare vid initial load genom att lazy-mounta tunga sekundärpaneler. Kartan + Dagens jobb är fortsatt öppna direkt. Inget UI-beteende ändras utöver att panelerna börjar i stängt läge.

## Fil som ändras

- `src/pages/OpsControlCenter.tsx` (enda filen)

## Ändringar

1. **Ta bort top-level `useLivePackingFeed()`-anropet.** Hooken flyttas in i en wrapper-komponent `<LiveProjectsPanelBody />` som bara renderas när panelen är öppen.

2. **Lägg till fyra `useState`-flaggor** (alla `false` som default):
   - `liveProjectsOpen`
   - `locationsOpen`
   - `commsOpen`
   - `staffCalendarOpen`

3. **Konvertera de fyra sekundära `<section>`-blocken** (Live projekt, Platshantering, Kommunikation, Personalkalender) till samma collapsible-mönster:
   - Header med titel + chevron + "Visa"/"Dölj"-text, `onClick` togglar respektive state.
   - Body renderas endast när `*Open === true` (villkorlig mount, inte bara `hidden`).
   - Ersätter `<details>`-varianten på Personalkalender med samma kontrollerade mönster för konsekvens.

4. **Wrapper-komponenter för att kapsla data-hookar** så att deras queries inte startar förrän panelen öppnas första gången:
   - `LiveProjectsPanelBody` — anropar `useLivePackingFeed()` internt och renderar `<OpsLiveProjects ... />`.
   - `OrganizationLocationsManager` mountas direkt i sin `<section>` när `locationsOpen` är `true` (komponenten hämtar sin egen data, så villkorlig mount räcker).
   - `OpsActivityComms` mountas när `commsOpen` är `true`. `activity`/`messages` kommer fortfarande från `useOpsControl` i denna prompt — bara mount-styrning här, hook-`enabled` löses i nästa prompt enligt instruktionen.
   - `OpsPlanningDayPanel` mountas när `staffCalendarOpen` är `true`.

5. **Behåll**:
   - All header-, KPI-, karta-, Dagens jobb-, broadcast- och side-panel-logik oförändrad.
   - Visuell layout (samma grid, samma `planning-card`, samma padding/höjder).
   - `useOpsControl`-anropet som det är (ändringar i `enabled` görs i nästa prompt).

## Resultat

Vid första rendering körs endast: `useOpsControl` (timeline, jobQueue, locations, mapJobs, messages, activity — som idag) + kartan + Dagens jobb. `useLivePackingFeed`, `OrganizationLocationsManager`, `OpsActivityComms` och `OpsPlanningDayPanel` mountas/fetchar först när användaren öppnar respektive panel.