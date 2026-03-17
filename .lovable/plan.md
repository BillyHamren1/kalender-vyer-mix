
Mål: göra raderingsflödet robust end-to-end så att ett projekt alltid försvinner direkt i UI, bokningen hamnar i korrekt lista, och inga “spökposter”/dubbletter gör att det ser ut som att inget hänt.

1) Vad som sannolikt händer nu (rotorsaker)
- Det finns datainkonsistens: minst en bokning har både aktivt litet + medelprojekt samtidigt (`booking_id = cd22...`), med nästan identiskt namn. Då kan man radera en rad men en “likadan” rad ligger kvar.
- `deleteProject` / `deleteJob` / `deleteLargeProject` uppdaterar bokningsflaggor utan att verifiera fel och utan att räkna ut om andra aktiva länkar fortfarande finns.
- UI visar generisk fel/success och saknar tydlig “du raderar just [Litet/Medel/Stort]” feedback samt pending-state per rad.

2) Design för stabilt raderingsflöde (helhet)
```text
Delete click
  -> tydlig bekräftelse (typ + namn + bokningsnr)
  -> mutation (pending på just den raden)
  -> ta bort entity
  -> recompute assignment för berörd bokning
       (finns annan aktiv job/project/large-link?)
       ja: behåll assigned=true + peka korrekt
       nej: assigned=false + nolla projektfält
  -> invalidera alla relevanta queries
  -> optimistic UI + rollback vid fel
```

3) Konkreta implementationer
A. Centralisera “recompute assignment state”
- Ny helper i services (t.ex. `bookingAssignmentService.ts`) som för en booking:
  - kollar aktiva `jobs` (status != completed)
  - kollar aktiva `projects` (status != completed/cancelled enligt vald regel)
  - kollar `large_project_bookings`
  - sätter `bookings.assigned_to_project`, `assigned_project_id`, `assigned_project_name`, `large_project_id` konsekvent.
- Anropas efter delete/create/convert-flöden.

B. Härda delete-services
- `src/services/projectService.ts` (`deleteProject`)
- `src/services/jobService.ts` (`deleteJob`)
- `src/services/largeProjectService.ts` (`deleteLargeProject`)
Ändringar:
- kontrollera alla DB-fel (inte ignorera update-fel)
- kör recompute efter borttag
- returnera strukturerat resultat (t.ex. `{bookingId, removedType}`) för bättre UI-feedback.

C. Gör UI-borttagning tydlig och pålitlig
- `src/components/project/UnifiedProjectList.tsx`
- `src/pages/project/ProjectLayout.tsx`
- `src/pages/JobDetail.tsx`
- `src/components/project/ProjectActionMenu.tsx`
Ändringar:
- använd `onSelect` i dropdown-items (robustare i Radix-menu)
- disable på delete under pending + spinner/visuell state
- förbättrad confirm-text: “Ta bort MEDelprojekt/LITET/STORT: [namn]”
- optimistisk borttagning av raden + rollback vid fel
- feltoast med faktisk backendmessage.

D. Fixa triage-listans källa till sanning
- `src/components/project/IncomingBookingsList.tsx`
- `src/components/dashboard/DashboardNewBookings.tsx`
Ändringar:
- sluta lita enbart på `assignedToProject`-flagga; filtrera också bort bokningar som faktiskt har aktiv job/project/large-link (via lättviktig extraquery eller dedikerad service).
- Detta stoppar “blink/försvinner/återkommer”-beteenden vid inkonsistent data.

E. Datastädning (engångsfix)
- Lägg migration/script som hittar bokningar med flera aktiva projekttyper och normaliserar:
  - behåll 1 aktiv länk enligt regel (t.ex. large > medium > small eller senaste uppdaterad)
  - recompute assignment-fält.
- Detta tar bort redan uppkommen dubblettproblematik.

4) Verifiering (obligatorisk E2E)
- Fall 1: radera litet projekt från `/projects` → raden försvinner direkt, rätt toast, booking hamnar/hamnar inte i “Nya bokningar” enligt regel.
- Fall 2: radera medelprojekt från detaljsida → redirect + korrekt liststatus.
- Fall 3: radera stort projekt med flera bokningar → alla berörda bokningar får korrekt assignment-state.
- Fall 4: scenario med avbokad/offert/confirmed → inga felaktiga återinträden i triage.
- Fall 5: dubblettscenario (job+project på samma booking) → radering av ena typen känns inte som no-op, UI visar tydligt vilken typ som försvann.

Tekniska detaljer (kort)
- Fokus är att gå från “flagg-baserad gissning” till “relations-baserad sanning” efter varje mutation.
- Vi minimerar race conditions med recompute + samlad query-invalidating.
- Vi förbättrar operatörens upplevelse med tydlig typ-specifik bekräftelse och pending/rollback i listan.
