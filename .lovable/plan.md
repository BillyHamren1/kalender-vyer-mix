## Mål

Standardvy i `TimeGrid` ska låta tidsspannet **05–20** fylla hela tillgängliga höjden — varje timme blir alltså högre/läsbarare. Om något event sträcker sig efter 20:00 ska antalet "synliga timmar" i höjdberäkningen öka så att eventet får plats, vilket gör att timmarna krymper (men aldrig under min-läsbarhet).

## Vad ändras

Endast `src/components/Calendar/TimeGrid.tsx` — beräkningen av `slotPx`.

Idag:
```ts
const slotPx = scrollH > 0
  ? Math.max(22, Math.floor(scrollH / timeSlots.length))  // timeSlots.length = 24
  : 25;
```

Nytt beteende:
1. Beräkna `maxEndHour` från alla events på dagen (resurser × `getEventsForDayAndResource`). Tolka över-midnatt-event som `endHour + 24` (samma logik som `getEventPosition`).
2. `requiredHours = Math.ceil(maxEndHour - 5)` (slut minus 05).
3. `visibleHours = clamp(requiredHours, 15, 24)` — minst 05–20 (15 timmar), max 05–05 nästa dag (24 timmar).
4. `slotPx = scrollH > 0 ? Math.max(22, Math.floor(scrollH / visibleHours)) : 36`.

Resultatet:
- Tom dag / dag som slutar ≤ 20:00 → 15 slots fyller höjden → varje timme blir markant större (~50–60 px istället för ~25 px på samma container).
- Dag med event som slutar 22:00 → 17 slots i höjdberäkning, sista timmarna scrollar in om de inte ryms.
- Dag som går över midnatt → upp till 24 slots, samma min 22 px-skydd som idag.

DOM behåller alla 24 slots (05–04) — vi ändrar bara hur höjden fördelas, så att default-vyn visar de timmar som faktiskt används utan tom plats nedanför, och nattliga events fortfarande är åtkomliga via scroll.

## Verifiering

- Preview `/calendar`: tom dag → timrutorna fyller hela calendar-höjden, inget tomrum under 20:00.
- Lägg/öppna en dag med ett event som slutar 22:00 → timmarna blir lite mindre, 22-eventet syns utan scroll om det får plats.
- Dag med över-midnatt-event → scroll fungerar som idag, ingen timme < 22 px.
- Sidoeffekt: `getEventPosition` använder samma `slotPx`, så event-höjder skalar automatiskt.
