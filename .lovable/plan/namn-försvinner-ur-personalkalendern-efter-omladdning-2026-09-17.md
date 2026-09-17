# Namn försvinner ur personalkalendern efter omladdning

## Vad vi vet just nu (kontrollerat)

- Personal som planeras i personalkalendern visas direkt på skärmen **innan** servern hunnit bekräfta att den sparats. Misslyckas sparandet syns namnet ändå fram till nästa omladdning — exakt det beteende du beskriver.
- Databasen innehåller fortfarande tilldelningar för kommande dagar (t.ex. 17–20 sept), så det är inte en generell rensning av all planering.
- Varje tilldelning märks automatiskt med den inloggades organisation och kan bara läsas av samma organisation. Rader som hamnar på fel organisation blir osynliga vid omladdning.
- Det finns två äldre planeringsvägar (översiktssidans planeringsrutor och tidslinjen i kontrollvyn) som **raderar all** personens planering för dagen innan de skriver den nya. Används de blir personen borta från övriga team samma dag.

Vilken av dessa som drabbar er är inte bevisat ännu. Därför börjar planen med att göra felet synligt istället för tyst.

## Vad som görs

1. **Kvittens på att planeringen faktiskt sparades**
   - Efter varje placering läses raden tillbaka från servern.
   - Bekräftad rad → grönt "Personal tilldelad" som idag.
   - Ingen rad tillbaka (eller fel) → namnet tas bort direkt på skärmen och ett tydligt rött meddelande visas med orsaken, så ingen tror att planeringen ligger kvar.
   - Samma kvittens vid borttagning.

2. **Loggning som pekar ut orsaken**
   - Misslyckade placeringar loggas med datum, team och felorsak (aldrig personuppgifter utöver id), så vi ser direkt om det är behörighet/organisation eller något annat.

3. **De två gamla planeringsvägarna slutar radera**
   - Översiktssidan och kontrollvyns tidslinje kopplas om till samma sparväg som personalkalendern (lägg till en rad, radera inte personens övriga team samma dag).
   - Kontrollvyns tidslinje planerar idag alltid på dagens datum — den får använda det datum man faktiskt arbetar med.

4. **Verifiering**
   - Automatiska tester: placering som nekas av servern får inte ligga kvar på skärmen; placering via översikt/tidslinje får inte ta bort personens övriga team samma dag.
   - Automatiskt genomklick i förhandsvisningen av personalkalendern efter ändringen.

## Teknisk detalj

- `src/hooks/useUnifiedStaffOperations.tsx`: `handleStaffDrop` gör optimistisk uppdatering utan read-back; lägg till verifiering mot `staff_assignments` (staff_id + team_id + assignment_date) efter `assignStaffToTeamCore`/`removeStaffAssignmentCore`, med rollback av cachen vid utebliven rad.
- `src/services/staffAssignmentCore.ts`: returnera den sparade raden (`.select().maybeSingle()`) så kvittensen sker i den enda kanoniska skrivvägen.
- `src/services/planningDashboardService.ts`: `assignStaffToDay` och `assignStaffToBooking` gör `delete` på (staff_id, date) före `insert` — ersätt med delegering till `assignStaffToTeamCore` (upsert på staff_id, team_id, assignment_date). Anropas från `src/hooks/usePlanningDashboard.tsx` och `src/components/ops-control/OpsStaffTimeline.tsx` (senare skickar hårdkodat `new Date()`).
- RLS på `staff_assignments` är `organization_id = get_user_organization_id(auth.uid())` med `set_org_id`-trigger — inga schema-, RLS- eller triggerändringar ingår i planen.
- Tester: utökar `src/test/staffCalendar.contract.test.ts` + nytt testfall för read-back/rollback.
