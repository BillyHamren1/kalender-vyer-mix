## Problem som ska lösas
Systemet känns segt därför att flera vyer monterar samma tunga planeringshookar, och de hämtar för mycket data samt gör globala uppdateringar.

## Vad jag kommer att ändra
1. **Begränsa kalenderladdningen till synligt datumintervall**
   - Bygga om `useRealTimeCalendarEvents` så att den inte alltid laddar ett stort globalt fönster.
   - Skicka in aktiv vecka/dag/projektets faktiska datum och hämta bara de rader som behövs för den aktuella vyn.
   - Samma begränsning ska gälla fallback-anropen i `eventService`.

2. **Begränsa personalladdningen till aktuella dagar**
   - Bygga om `useUnifiedStaffOperations` så att den inte hämtar **alla** `staff_assignments` i hela databasen.
   - Använd datum-scopad query för aktuell vecka/dag och ta bort aggressiv `refetchOnMount: 'always'` där det inte behövs.
   - Behålla realtime, men bara invalidiera relevant synligt intervall.

3. **Avlasta bokningsflödet från full planeringskalender**
   - `BookingPlacementDialog` använder idag `PlacementDayCalendar`, som i praktiken monterar hela planeringsmotorn.
   - Jag byter det till en lättare, datum-scopad read-only variant så att bokning inte drar in hela personalkalenderns dataström.

4. **Stoppa onödiga full-reloads från realtime**
   - Minska full reload-beteendet i kalendern när `calendar_events`/`large_project_team_assignments` ändras.
   - Se till att förändringar utanför det synliga datumintervallet inte triggar omladdning.

5. **Verifiera med riktig prestandakoll**
   - Mäta före/efter i preview för `/calendar`, projekt och booking-placement.
   - Köra tester för de berörda hookarna och lägga till test för datum-scopad laddning så att problemet inte kommer tillbaka.

## Varför jag tror att detta är roten
- `CustomCalendar` fastnar på texten **"Laddar personalens planeringskalender..."** medan tunga hooks laddar färdigt.
- `useRealTimeCalendarEvents` laddar ett stort fönster av `calendar_events` plus extra enrichment från flera tabeller.
- `useUnifiedStaffOperations` hämtar hela `staff_assignments`-tabellen utan datumfilter.
- `BookingPlacementDialog` monterar en inbäddad planeringskalender och drar därmed in samma tunga laddning även i booking-flödet.

## Tekniska detaljer
Berörda huvudfiler:
- `src/hooks/useRealTimeCalendarEvents.tsx`
- `src/services/eventService.ts`
- `src/hooks/useUnifiedStaffOperations.tsx`
- `src/components/project/PlacementDayCalendar.tsx`
- `src/components/project/ProjectCalendarView.tsx`
- `src/pages/CustomCalendarPage.tsx`
- ev. `src/pages/WarehouseCalendarPage.tsx` / `src/pages/PersonalkalendernPage.tsx` för att skicka korrekt datumintervall

## Förväntat resultat
- Kalendern ska visa innehåll mycket snabbare.
- Projekt och bokning ska inte längre bli sega bara för att planeringskalendern finns inbäddad.
- Färre korsanrop mellan vyer och mindre risk för att hela appen känns låst.