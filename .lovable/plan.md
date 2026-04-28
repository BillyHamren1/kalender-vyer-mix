## Problemet i klartext

Armands "26h 53m" på 28 april består av:
- **12,5h riktig arbetstid** på Lager-projektet (från `time_reports`)
- **13,5h närvaro** på FA Warehouse (från `location_time_entries`)

Båda är samma fysiska tid på samma plats. Men admin-vyn lägger ihop dem som om han jobbat 26 timmar. Det är fel — närvarotimern är bara en passiv markör för "var i lagret", inte arbetad tid.

Samma sak händer för alla anställda som har en aktiv närvaro-timer parallellt med en projekt-/booking-timer. Det är därför "alla timmar är dubbelräknade".

## Rotorsak

I `src/pages/StaffTimeReports.tsx` finns redan en dedup-mekanism (rad 260–281) som ska hindra dubbelräkning. Men den fungerar bara när närvaro-raden har ett `booking_id`. För **presence-timrar** (vilket är default enligt projektets egna regler — se memory `location-timer-role-v1`) är `booking_id` alltid `NULL`, och då går dedupen inte igång → båda raderna räknas.

Bevis från databasen för Armands 28 april:
```
location_time_entries: booking_id=NULL, FA Warehouse, 13h 27m
time_reports:          booking_id=6fd6e6da (Lager), 12h 28m
```

## Fix

I `src/pages/StaffTimeReports.tsx`, loopen som processar `location_time_entries` (ungefär rad 369–443):

**Regel:** En `location_time_entry` med `booking_id = NULL` OCH `large_project_id = NULL` är en ren närvaro-rad. Den ska:

1. **INTE** adderas till `total_hours` (lönesumman)
2. **INTE** öka `reports_count`
3. Fortfarande visas som ett eget segment i tidslinjen, men märkt "Närvaro" så admin ser var personen varit
4. Inte räknas som "öppen tidrapport" (`has_open_report`) — närvaron är passiv

Detta speglar exakt vad memory `location-timer-role-v1` redan säger: presence-LTE genererar **ingen time_report på stop**. Då ska den heller inte räknas som arbetad tid i admin-vyn.

## Konkreta kodändringar

**Fil:** `src/pages/StaffTimeReports.tsx`

I loopen `for (const e of locationEntries as any[])`:

- Lägg till tidigt i loopen: `const isPresenceOnly = !e.booking_id && !e.large_project_id;`
- Hoppa över `a.total_hours += hours` när `isPresenceOnly`
- Hoppa över `a.reports_count += 1` när `isPresenceOnly`
- Hoppa över `a.has_open_report = true` när `isPresenceOnly`
- Behåll segment-skapandet, men sätt `hours: 0` på presence-segmentet och en label som "Närvaro: {locationName}" så det syns i tidslinjen utan att förvränga summan
- Tillåt fortfarande `earliest_start`/`latest_end` att uppdateras (så "från–till" på dagen blir rätt)

## Vad som INTE ändras

- Inga DB-migrationer
- Ingen ändring i mobile-app eller timer-flödet
- Ingen ändring i `time_reports` eller `location_time_entries` — datan är korrekt, det är bara visningen som dubbelräknat
- Cron `close-stale-workday-entries` påverkas inte
- Bilden visar fortfarande närvaro-raderna, men de räknas inte med i totalen

## Bonusfix (samtidigt)

De 3 mini-raderna kl 20:31–20:33 (1 min vardera = 0,02h × 3) på `time_reports` är skräp från start/stopp-loopen vi diskuterade tidigare. Vi LÅTER dem ligga kvar — separat åtgärd. Den här ändringen handlar bara om dubbelräkningen mellan presence och work.

## Test

Efter ändring: ladda om `/staff-management/time-reports` och kolla Armands kort för 28 april. Ska visa **~12,5h** istället för 26h 53m. Närvaro-raderna ska fortfarande synas som "Närvaro: FA Warehouse" men utan att påverka summan.

**Säg "kör" så genomför jag ändringen.**
