

# Ta bort redundanta tidskolumner och härleda tider från bokningar

## Bakgrund
När tider ändras i kalendern sparas de till **både** `calendar_events` och `bookings`-tabellen (fält som `rig_start_time`, `rig_end_time` etc.). Tiderna finns alltså redan på bokningarna. De 6 nya kolumnerna på `large_projects` är överflödiga och skapar risk för datakonflikt.

## Plan

### 1. Härleda tider från bokningar i LargeProjectLayout
I `src/pages/project/LargeProjectLayout.tsx`: beräkna tiderna via `useMemo` från de länkade bokningarnas tidsfält:
- RIGG: tidigaste `rig_start_time`, senaste `rig_end_time`
- EVENT: tidigaste `event_start_time`, senaste `event_end_time`  
- NEDRIVNING: tidigaste `rigdown_start_time`, senaste `rigdown_end_time`

Skicka dessa beräknade tider till `LargeProjectScheduleEditable`.

### 2. Uppdatera LargeProjectScheduleEditable
- Visa härledda tider (read-only, kommer från bokningarna)
- Behåll datumredigering (start_date/event_date/end_date på projektnivå)
- Ta bort tidsinmatning från EditDateDialog för stora projekt (tiderna styrs via kalendern eller bokningarna)

### 3. Ta bort de 6 tidskolumnerna från databasen
Migration som droppar: `start_start_time`, `start_end_time`, `event_start_time`, `event_end_time`, `end_start_time`, `end_end_time` från `large_projects`.

### 4. Uppdatera typer
Ta bort de 6 tidsfälten från `LargeProject`-interfacet i `src/types/largeProject.ts`.

## Filer som ändras
- `src/pages/project/LargeProjectLayout.tsx` — beräkna och skicka härledda tider
- `src/components/project/LargeProjectScheduleEditable.tsx` — visa härledda tider, ta bort tidsinmatning
- `src/types/largeProject.ts` — rensa bort tidsfält
- Ny migration — droppa 6 kolumner

