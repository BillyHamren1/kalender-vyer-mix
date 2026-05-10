## Mål

Visa exakt var en person har varit på en given dag i felsökningsdrawern på `/staff-management/time-reports`, och låt admin filtrera trailen med ett tidsfönster (från–till) för att se var de var mellan specifika klockslag.

## Lösning

Lägg till en ny flik **"Karta"** i `DecisionTraceDrawer` som renderar den befintliga `StaffMovementMap` med en tidsfönster-kontroll ovanför. Allt sker i frontend, read-only, utan ändringar i motorn eller mobilappen.

## Filer att ändra

- `src/components/staff/DecisionTraceDrawer.tsx` — ny flik + tidsfilter-UI
- (ny) `src/components/staff/DecisionMapTab.tsx` — håller filter-state och renderar `StaffMovementMap`

`StaffMovementMap` finns redan och stödjer `fromIso`/`toIso`-filter, så ingen ändring behövs där. Den läser pings via `mobileApi.getMovementForDay(staffId, date)`.

## UI-design

Ny tab "Karta" i `TabsList` mellan "Rå GPS" och "Diagnostik" (eller före "Rå GPS"):

```
[ Översikt ] [ Beslutskedja ] [ Närvaro ] [ Targets ] [ Karta ] [ Rå GPS ] [ Diagnostik ]
```

`DecisionMapTab` innehåller:

1. **Filterrad** (sticky överst i tab-innehållet)
   - Två `<Input type="time">` fält: "Från" och "Till" (default tomma = hela dagen)
   - Snabb-chips: `Hela dagen`, `Förmiddag (06–12)`, `Eftermiddag (12–18)`, `Kväll (18–24)`
   - Chips för varje `reportCandidateBlock` med tider, t.ex. `08:12–11:45 · Projekt X` — klick fyller fönstret med blockets start/slut
   - "Rensa"-knapp
   - Liten räknare: "X positioner i fönstret"

2. **Karta**
   - `<StaffMovementMap staffId date fromIso toIso className="h-[520px]" />`
   - Polylinje + start/slut-markörer finns redan; tidsfönstret begränsar punkter och markörer flyttas till filtrerat första/sista ping.

3. **Tom-state**
   - Ärver `StaffMovementMap`s "Ingen rörelsehistorik"-meddelande (inkl. notisen att data rensas ~7 dagar efter godkänd rapport).

## Tekniska detaljer

- Tidsfönstret konverteras till ISO genom att kombinera `props.date` (YYYY-MM-DD) + valt klockslag i lokal tidszon: `new Date(`${date}T${hh}:${mm}:00`).toISOString()`.
- Block-chips byggs från `reportCandidateBlocks` som redan finns som prop på drawern (start/end + label från target/title).
- State är lokal i `DecisionMapTab` (useState), nollställs när drawer stängs (komponenten unmountas via tab-byte är OK — filtret återställs).
- Inga nya hooks, inga nya endpoints, inga writes. Mapbox-token hämtas redan internt av `StaffMovementMap` via befintlig `mapbox-token` edge function.

## Constraint-respekt

- Read-only: enbart visning av befintliga GPS-pings.
- Motorn orörd.
- Mobilappen orörd.
- Ingen AI körs.
- Huvudvyn (StaffDayTimelineCard) orörd; allt ligger bakom "Visa tolkning"-drawern.