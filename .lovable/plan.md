
## Problem

**1. Granska-knappen hoppar förbi diff:en.**
`IncomingBookingsList.handleReviewUpdate` (src/components/project/IncomingBookingsList.tsx:182) navigerar direkt till projektet och kör `markSeen` — användaren får aldrig se vad som ändrats. Diff-dialogen `ProjectUpdateDialog` (med `BookingChangesDetail`) finns redan och används av `UnifiedProjectList`, men inte härifrån.

**2. Projektsidan laddade långsamt.**
`ProjectViewPage` triggar många sekventiella queries (booking-products, team, kalenderhändelser, ekonomi, leverantörsfakturor, etc.). Behöver mätas innan vi vet exakt vilken som är boven.

## Plan

### Steg 1 – Visa diff:en vid "Granska" (snabbfix, det här löser huvudfrågan)

I `src/components/project/IncomingBookingsList.tsx`:

- Lägg till lokal state `updateDialog: { name, bookingIds, navigateTo } | null` (samma form som i `UnifiedProjectList`).
- Ändra `handleReviewUpdate(meta)` så att den **istället för att navigera direkt**:
  - Bygger `navigateTo` enligt nuvarande logik (large → `/large-project/:id`, project → `/project/:id`, annars `/booking/:id`).
  - För large/project: slå ihop alla `visibleUpdates` som tillhör samma target och skicka **alla** booking-id:n till dialogen (så att en uppdatering med flera bokningar visar alla diffar samtidigt, som listan redan visar `change_count`).
  - För lös bokning utan projekt: skicka bara `[meta.id]`.
  - `setUpdateDialog({...})`. Ingen `markSeen` här — `ProjectUpdateDialog` markerar själv via "Markera som läst" eller "Markera & öppna projekt".
- Rendera `<ProjectUpdateDialog />` i slutet av komponenten, identiskt med `UnifiedProjectList`.
- Ta bort den nuvarande direkt-`markSeen.mutate(booking.id)` i `handleReviewUpdate`.

Resultat: klick på Granska → modal med "Från → Till" per ändrat fält (kund, datum, tider, adress, interna anteckningar, status, etc.). Användaren väljer själv om de bara vill markera som läst eller öppna projektet.

### Steg 2 – Diagnostisera långsam projektladdning

Innan vi optimerar något måste vi veta vad som är långsamt. Jag lägger in lättviktig mätning + tittar på de tyngsta kandidaterna:

1. Lägg en `console.time('project-view:<projectId>')` / `timeEnd` runt huvud-`useQuery`-block i `ProjectViewPage` och de större barnsektionerna (team, produkter, ekonomi, leverantörsfakturor, kalender).
2. Be dig öppna projektet en gång till så jag kan läsa network + console och se vilken request som dominerar (jag misstänker `booking_products` med full `package_components`-payload eller ekonomi-aggregering, men gissar inte).
3. Baserat på mätningen: en riktad fix i nästa steg — t.ex. batcha queries parallellt, lazy-loada flikar (Ekonomi/Leverantörsfakturor behövs först när man byter flik), eller cacha `booking_products`-listan.

Steg 2 levereras som en separat, mindre PR efter att vi sett siffrorna — jag vill inte gissa-optimera ett 240-radig sida blint.

## Tekniska detaljer

- `ProjectUpdateDialog` accepterar redan `bookingIds: string[]` och loopar `BookingChangesDetail` per id, så ingen ändring krävs i den.
- `useMarkBookingChangesSeen` används redan av dialogen; vi tar bort den duplicerade `markSeen.mutate` i listan.
- Inga DB-/RLS-/migrations-ändringar.
- Inga ändringar i `UnifiedProjectList` (den fungerar redan rätt).

## Out of scope

- Faktisk perf-optimering av projektsidan (kommer i steg 2 efter mätning).
- Ändra hur `booking_changes` skapas eller vilka fält som loggas.
