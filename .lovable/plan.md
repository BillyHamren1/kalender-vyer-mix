

## Problem: Personal med GPS syns inte på kartan utan teamtilldelning

### Orsak

`fetchStaffLocations` i `planningDashboardService.ts` (rad 287-387) bygger sin lista **enbart** från `staff_assignments` för dagens datum. Personal som inte har en teamtilldelning för dagen filtreras bort — även om de aktivt rapporterar GPS-position via `staff_locations`.

Ranjan delar sin position och rapporterar tid, men saknar troligen en `staff_assignments`-post för idag → han syns aldrig på kartan.

### Åtgärd

Ändra `fetchStaffLocations` så att den **även** inkluderar personal som har en aktiv GPS-position i `staff_locations` (uppdaterad senaste 10 min), oavsett om de har en teamtilldelning.

**Logik:**
1. Hämta `staff_assignments` som idag (befintlig logik)
2. **Ny:** Hämta alla `staff_locations` uppdaterade senaste 10 min
3. Mergea: personal med assignment visas som förut, personal med bara GPS (utan assignment) läggs till med `teamName: 'Ingen tilldelning'` och GPS-koordinater

**Fil som ändras:**
- `src/services/planningDashboardService.ts` — funktionen `fetchStaffLocations`

Hämtar extra staff-namn via join på `staff_members` för GPS-poster som saknar assignment. Inga databasändringar behövs.

