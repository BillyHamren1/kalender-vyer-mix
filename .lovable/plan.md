## Problem

`ProjectPlanningSheet` öppnas alltid med hårdkodade defaulttider (rig 08–16, event 17–23, rigDown 08–16) — även när bokningen redan har skarpa tider satta. Tiderna finns på `bookings` (`rig_start_time/end_time`, `event_start_time/end_time`, `rigdown_start_time/end_time`, hålls i synk via Phase Time Sync), men dialogen selectar dem inte och läser dem inte.

## Fix

I `src/components/project/ProjectPlanningSheet.tsx`:

1. **Utöka bokningsquery** (raderna 86 och 100) — lägg till de sex tidsfälten i `select(...)`:
   `rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time`.

2. **Använd dem i seedningen** (raderna 108–117). Ersätt `DEFAULTS.<phase>.start/end` med en helper som:
   - tar bokningens värde om det finns (trimma sekunder, `08:00:00` → `08:00`),
   - faller tillbaka till `DEFAULTS[kind]` annars.

3. **Samma helper i `addDayForPhase`** (rad 141–156) — när användaren klickar "Lägg till dag" ska första dagen i en fas också ärva bokningens tid om en sådan finns, inte hårdkodade defaults. Andra dagen i samma fas behåller den redan inmatade tiden från befintlig dag (kopiera från sista raden i fasen istället för DEFAULTS).

4. **Stora projekt**: behåll nuvarande logik som tar `ctx.bookings[0]` som källa för seed (representant). Phase Time Sync garanterar att alla syskon har samma tider per fas+datum, så det är säkert.

5. **Test**: lägg till `src/components/project/__tests__/projectPlanningSheetSeed.test.ts` som verifierar helpern (`pickBookingTime(booking, 'rig', 'start')` etc.) — booking-värde vinner, fallback till DEFAULTS när null/tom.

## Inte i scope

- Ingen ändring i save-pathen — den skriver redan tillbaka rätt tider.
- Ingen ändring av booking-importen eller Phase Time Sync.
- Ingen ändring av team-defaults (separat fråga).
