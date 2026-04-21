
Målet är att ändra beteendet från “Ta bort” till ett konsekvent avbokningsflöde:

1. Byt åtgärden i projektlistan från radering till avbokning
- I projektlistan och projektets action-menu ska “Ta bort” inte längre anropa `deleteProject` / `deleteJob`.
- Istället ska klicket sätta status till `cancelled` för projekt/jobb.
- Text/UI uppdateras så handlingen tydligt betyder “Avboka / dölj från projekt”.

2. Dölj avbokade från standardvyn, men behåll dem i systemet
- Standardfiltret i projektlistan ska fortsatt exkludera `status === 'cancelled'`.
- Avbokade ska bara visas när användaren aktivt väljer filtret “Avbokade”.
- Ingen soft-delete ska ske i detta flöde, så historik, kommentarer och filer finns kvar.

3. Stoppa återkomsten från import/synk
- `import-bookings` har idag logik som för avbokade bokningar kan sätta `assigned_to_project` tillbaka till `false` om det fortfarande finns avbokade projekt/jobb kopplade. Det gör att samma bokning kommer tillbaka igen i inbox/projektflödet.
- Den logiken ska justeras så avbokade bokningar med avbokade länkade projekt/jobb förblir “hanterade/dolda” och inte återintroduceras i projektinboxen.
- Detta måste följa befintlig policy: avbokade objekt ska bevaras, inte raderas.

4. Synka UI-komponenterna så de följer samma regel
- `DashboardCancelledBookings`: knappen ska inte radera posten utan markera/dess länkade objekt som redan hanterade och dolda.
- `ProjectActionMenu`, `UnifiedProjectList`, `ProjectLayout` och motsvarande jobb-vyer ska använda samma avbokningslogik.
- Toasts, knapptext och bekräftelsedialoger ska säga “Avbokad”/“Dold från projekt” istället för “borttagen”.

5. Säkerställ återaktivering när bokningen blir bekräftad igen
- Nuvarande livscykelregel där en bokning som blir `CONFIRMED` återaktiverar länkade `cancelled` projekt/jobb ska behållas.
- Justeringen får alltså inte bryta återaktiveringsflödet; den ska bara stoppa att avbokade poster dyker upp om och om igen innan dess.

6. Validering efter implementation
- Scenario A: klick på åtgärden i projektlistan -> status blir `cancelled`, posten försvinner från “Alla aktiva”.
- Scenario B: synk/import körs -> posten kommer inte tillbaka i “Nya bokningar” eller aktiv projektlista.
- Scenario C: filtret “Avbokade” visar posten.
- Scenario D: om extern bokning åter blir `CONFIRMED` -> projekt/jobb återaktiveras och blir synliga igen.

Tekniska filer som behöver ändras
- `src/components/project/UnifiedProjectList.tsx`
- `src/components/project/ProjectActionMenu.tsx`
- `src/pages/project/ProjectLayout.tsx`
- `src/components/dashboard/DashboardCancelledBookings.tsx`
- `src/services/projectService.ts`
- `src/services/jobService.ts`
- `supabase/functions/import-bookings/index.ts`

Förväntad implementation
- Lägg till/återanvänd tydliga statusfunktioner för avbokning i service-lagret istället för delete-funktionerna.
- Uppdatera alla call sites till dessa statusfunktioner.
- Justera importlogiken så avbokade och redan hanterade bokningar inte återöppnas i projektinboxen.
- Behåll soft-delete enbart för verklig radering/arkivfall, inte för normal avbokning.

